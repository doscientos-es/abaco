-- Short-lived read capability. It is unrelated to existing quote, report, or appointment tokens.
create table app_private.client_portal_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  visit_ids uuid[] not null check (cardinality(visit_ids) <= 20),
  documents jsonb not null check (jsonb_typeof(documents) = 'array' and jsonb_array_length(documents) <= 10),
  created_at timestamptz not null,
  created_by uuid not null,
  expires_at timestamptz not null check (expires_at > created_at and expires_at <= created_at + interval '24 hours'),
  blocked_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  foreign key (client_id, tenant_id) references public.clients(id, tenant_id) on delete cascade,
  check ((revoked_at is null) = (revoked_by is null))
);
alter table app_private.client_portal_grants enable row level security;
revoke all on app_private.client_portal_grants from public, anon, authenticated, service_role;
create index client_portal_grants_scope on app_private.client_portal_grants (tenant_id, client_id, expires_at desc)
  where revoked_at is null;
create function app_private.block_client_portal_on_archive()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Keep issuance/revocation audit metadata, but an archive never resurrects a capability.
  update app_private.client_portal_grants
  set blocked_at = clock_timestamp(), visit_ids = '{}'::uuid[], documents = '[]'::jsonb
  where tenant_id = new.tenant_id and client_id = new.id and blocked_at is null
    and revoked_at is null and expires_at > clock_timestamp();
  return new;
end;
$$;
revoke all on function app_private.block_client_portal_on_archive() from public, anon, authenticated, service_role;
create trigger block_client_portal_on_archive
after update of archived_at on public.clients for each row
when (old.archived_at is null and new.archived_at is not null)
execute function app_private.block_client_portal_on_archive();

create function app_private.require_client_portal_admin(p_tenant_id uuid, p_client_id uuid)
returns uuid language plpgsql stable security invoker set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or p_tenant_id is null or p_client_id is null
    or not coalesce(public.has_role(p_tenant_id, array['owner','admin']::public.app_role[]), false)
    or not exists (select 1 from public.clients c where c.id = p_client_id and c.tenant_id = p_tenant_id)
  then raise exception 'No se puede gestionar el portal de este cliente' using errcode = '42501'; end if;
  return actor;
end;
$$;

-- One candidate source for the office picker, grant validation, and public output.
create function app_private.client_portal_visits(p_tenant_id uuid, p_client_id uuid,
  p_ids uuid[], p_now timestamptz)
returns table(id uuid, office_title text, starts_at timestamptz, ends_at timestamptz, timezone text, status text)
language sql stable security invoker set search_path = '' as $$
  select v.id, v.title, v.scheduled_start_at, v.scheduled_end_at,
    coalesce(l.timezone,'Europe/Madrid'), v.status
  from public.service_visits v
  left join public.service_locations l on l.id = v.location_id
    and l.tenant_id = v.tenant_id and l.client_id = v.client_id
  where v.tenant_id = p_tenant_id and v.client_id = p_client_id
    and (p_ids is null or v.id = any(p_ids))
    and v.scheduled_start_at between p_now - interval '12 hours' and p_now + interval '60 days'
    and ((v.status = 'scheduled' and v.scheduled_start_at >= p_now)
      or (v.status = 'in_progress' and v.scheduled_end_at > p_now))
  order by v.scheduled_start_at, v.id
  limit 30;
$$;

-- Only an immutable closed version belonging to this client is eligible.
-- The only payload is closure time, version and counts; no raw text, paths or media ever leaves SQL.
create function app_private.client_portal_documents(p_tenant_id uuid, p_client_id uuid, p_ids uuid[])
returns table(id uuid, office_title text, closed_at timestamptz, document jsonb)
language sql stable security invoker set search_path = '' as $$
  with eligible as (
    select r.id, v.title, r.closed_at, r.version,
      case when jsonb_typeof(r.snapshot #> '{report,data,checklist}') = 'array'
        then r.snapshot #> '{report,data,checklist}' else '[]'::jsonb end as checks
    from public.service_visit_report_versions r
    join public.service_visits v on v.id = r.visit_id and v.tenant_id = r.tenant_id
    where r.tenant_id = p_tenant_id and v.client_id = p_client_id
      and r.snapshot #>> '{client,id}' = p_client_id::text
      and (p_ids is null or r.id = any(p_ids))
      and r.closed_at >= statement_timestamp() - interval '90 days'
    order by r.closed_at desc, r.id
    limit 20
  )
  select e.id, e.title, e.closed_at, jsonb_build_object(
    'closedAt', e.closed_at,
    'version', e.version,
    'checksTotal', jsonb_array_length(e.checks),
    'checksDone', (select count(*) from jsonb_array_elements(e.checks) as items(item)
      where items.item -> 'done' = 'true'::jsonb)
  )
  from eligible e;
$$;

create function app_private.list_client_portal_options(p_tenant_id uuid, p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare active_client boolean;
begin
  perform app_private.require_client_portal_admin(p_tenant_id,p_client_id);
  select c.archived_at is null into active_client from public.clients c
    where c.id = p_client_id and c.tenant_id = p_tenant_id;
  return jsonb_build_object(
    'clientActive', active_client,
    'visits', case when active_client then (select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'officeTitle', v.office_title, 'startsAt', v.starts_at,
      'endsAt', v.ends_at, 'timezone', v.timezone, 'status', v.status
    ) order by v.starts_at,v.id), '[]'::jsonb)
    from app_private.client_portal_visits(p_tenant_id,p_client_id,null,statement_timestamp()) v) else '[]'::jsonb end,
    'documents', case when active_client then (select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'officeTitle', d.office_title, 'document', d.document
    ) order by d.closed_at desc,d.id), '[]'::jsonb)
    from app_private.client_portal_documents(p_tenant_id,p_client_id,null) d) else '[]'::jsonb end,
    'activeLinks', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'createdAt', g.created_at, 'expiresAt', g.expires_at, 'blockedAt', g.blocked_at
    ) order by (g.blocked_at is null) desc,g.created_at desc,g.id), '[]'::jsonb)
    from (
      select id, created_at, expires_at, blocked_at
      from app_private.client_portal_grants where tenant_id = p_tenant_id
        and client_id = p_client_id and revoked_at is null and expires_at > statement_timestamp()
      order by (blocked_at is null) desc,created_at desc,id limit 20
    ) g)
  );
end;
$$;

create function app_private.create_client_portal_grant(p_tenant_id uuid, p_client_id uuid,
  p_token_hash text, p_visits uuid[], p_documents uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := app_private.require_client_portal_admin(p_tenant_id,p_client_id);
  t timestamptz;
  visit_count integer;
  docs jsonb;
  grant_row app_private.client_portal_grants%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_visits is null or p_documents is null
    or coalesce(array_ndims(p_visits), 1) <> 1 or coalesce(array_ndims(p_documents), 1) <> 1
    or cardinality(p_visits) > 20 or cardinality(p_documents) > 10
    or cardinality(p_visits) + cardinality(p_documents) = 0
  then raise exception 'Selección no válida' using errcode = '22023'; end if;
  -- Lock the same client through issuance; the public lookup still rechecks archival.
  perform 1 from public.clients c where c.id = p_client_id and c.tenant_id = p_tenant_id
    and c.archived_at is null for share;
  if not found then raise exception 'No se pueden crear enlaces para un cliente archivado' using errcode = '42501'; end if;
  if not coalesce(public.tenant_can_write(p_tenant_id), false)
  then raise exception 'La empresa no puede crear enlaces' using errcode = '42501'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_client_id::text, 0));
  t := clock_timestamp();
  select count(*) into visit_count
    from app_private.client_portal_visits(p_tenant_id,p_client_id,p_visits,t);
  select coalesce(jsonb_agg(d.document order by d.closed_at desc,d.id),'[]'::jsonb) into docs
    from app_private.client_portal_documents(p_tenant_id,p_client_id,p_documents) d;
  if visit_count <> cardinality(p_visits) or jsonb_array_length(docs) <> cardinality(p_documents)
  then raise exception 'La selección contiene elementos que ya no se pueden compartir' using errcode = '22023'; end if;

  if (select count(*) from app_private.client_portal_grants where tenant_id = p_tenant_id
    and client_id = p_client_id and blocked_at is null and revoked_at is null and expires_at > t) >= 5
  then raise exception 'Revoca un enlace activo antes de crear otro' using errcode = '54000'; end if;

  insert into app_private.client_portal_grants(tenant_id,client_id,token_hash,visit_ids,documents,
    created_at,created_by,expires_at)
  values (p_tenant_id,p_client_id,p_token_hash,p_visits,docs,t,actor,t + interval '24 hours')
  returning * into grant_row;
  return jsonb_build_object('id',grant_row.id,'createdAt',grant_row.created_at,'expiresAt',grant_row.expires_at);
end;
$$;

create function app_private.revoke_client_portal_grant(p_tenant_id uuid, p_client_id uuid, p_grant_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := app_private.require_client_portal_admin(p_tenant_id,p_client_id);
begin
  update app_private.client_portal_grants
  set revoked_at = clock_timestamp(), revoked_by = actor, visit_ids = '{}'::uuid[], documents = '[]'::jsonb
  where id = p_grant_id and tenant_id = p_tenant_id and client_id = p_client_id
    and revoked_at is null and expires_at > clock_timestamp();
  return found;
end;
$$;

-- Only the server role can do this lookup. It never returns source IDs, visit names, snapshots or media.
create function app_private.read_client_portal_grant(p_token_hash text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'expiresAt', g.expires_at,
    'visits', (select coalesce(jsonb_agg(jsonb_build_object(
      'startsAt', v.starts_at, 'endsAt', v.ends_at, 'timezone', v.timezone, 'status', v.status
    ) order by v.starts_at,v.id), '[]'::jsonb)
    from app_private.client_portal_visits(g.tenant_id,g.client_id,g.visit_ids,statement_timestamp()) v),
    'documents', g.documents
  )
  from app_private.client_portal_grants g
  join public.clients c on c.id = g.client_id and c.tenant_id = g.tenant_id
    and c.archived_at is null
  where p_token_hash ~ '^[0-9a-f]{64}$' and g.token_hash = p_token_hash
    and g.blocked_at is null and g.revoked_at is null and g.expires_at > statement_timestamp();
$$;

create function public.list_client_portal_options(p_tenant_id uuid, p_client_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
begin atomic select app_private.list_client_portal_options(p_tenant_id,p_client_id); end;
create function public.create_client_portal_grant(p_tenant_id uuid, p_client_id uuid,
  p_token_hash text, p_visits uuid[], p_documents uuid[])
returns jsonb language sql security invoker set search_path = ''
begin atomic select app_private.create_client_portal_grant(p_tenant_id,p_client_id,p_token_hash,p_visits,p_documents); end;
create function public.revoke_client_portal_grant(p_tenant_id uuid, p_client_id uuid, p_grant_id uuid)
returns boolean language sql security invoker set search_path = ''
begin atomic select app_private.revoke_client_portal_grant(p_tenant_id,p_client_id,p_grant_id); end;
create function public.read_client_portal_grant(p_token_hash text)
returns jsonb language sql stable security invoker set search_path = ''
begin atomic select app_private.read_client_portal_grant(p_token_hash); end;

revoke all on function app_private.require_client_portal_admin(uuid,uuid),
  app_private.client_portal_visits(uuid,uuid,uuid[],timestamptz),
  app_private.client_portal_documents(uuid,uuid,uuid[]) from public, anon, authenticated, service_role;

do $$
declare schema_name text; signature text;
begin
  foreach schema_name in array array['public','app_private'] loop
    foreach signature in array array[
      'list_client_portal_options(uuid,uuid)', 'create_client_portal_grant(uuid,uuid,text,uuid[],uuid[])',
      'revoke_client_portal_grant(uuid,uuid,uuid)', 'read_client_portal_grant(text)'
    ] loop
      execute format('revoke all on function %I.%s from public, anon, authenticated, service_role',schema_name,signature);
      execute format('grant execute on function %I.%s to %I',schema_name,signature,
        case when signature = 'read_client_portal_grant(text)' then 'service_role' else 'authenticated' end);
    end loop;
  end loop;
end;
$$;
notify pgrst, 'reload schema';
