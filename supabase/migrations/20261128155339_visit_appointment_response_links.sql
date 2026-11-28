-- Capability for a single scheduled revision, separate from portal accounts and reports.
-- The public API never returns visit/customer records or the stored digest.
create table public.visit_appointment_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  visit_id uuid not null,
  visit_revision timestamptz not null,
  original_start timestamptz not null,
  original_end timestamptz not null,
  timezone text not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  requested_hours integer not null check (requested_hours in (24,72,168)),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null,
  create_operation_id uuid not null unique,
  revoked_at timestamptz,
  revoked_by uuid,
  response text check (response in ('confirmed','change')),
  proposed_start timestamptz,
  responded_at timestamptz,
  accept_next_response_after timestamptz,
  office_decision text check (office_decision in ('approved','declined')),
  decided_at timestamptz,
  decided_by uuid,
  decision_operation_id uuid unique,
  foreign key (visit_id, tenant_id) references public.service_visits(id, tenant_id) on delete cascade,
  check (original_end > original_start and expires_at <= original_start),
  check ((revoked_at is null) = (revoked_by is null)),
  check ((response is null) = (responded_at is null)),
  check (coalesce(response = 'change', false) = (proposed_start is not null)),
  check ((office_decision is null and decided_at is null and decided_by is null and decision_operation_id is null)
    or (office_decision is not null and response is not distinct from 'change'
      and decided_at is not null and decided_by is not null and decision_operation_id is not null))
);

create index visit_appointment_links_visit_idx
  on public.visit_appointment_links (tenant_id, visit_id, created_at desc);
create index visit_appointment_links_pending_idx
  on public.visit_appointment_links (tenant_id, responded_at desc, id)
  where response = 'change' and office_decision is null;
create unique index visit_appointment_links_single_live_idx
  on public.visit_appointment_links (tenant_id, visit_id)
  where revoked_at is null and response is null;
alter table public.visit_appointment_links enable row level security;
revoke all on public.visit_appointment_links from public, anon, authenticated;
grant select (id, tenant_id, visit_id, visit_revision, original_start, original_end, timezone,
  expires_at, created_at, revoked_at, response, proposed_start, responded_at, office_decision, decided_at)
  on public.visit_appointment_links to authenticated;
create policy visit_appointment_links_office_read on public.visit_appointment_links
  for select to authenticated using (
    public.has_role(tenant_id, array['owner','admin']::public.app_role[])
    and public.company_onboarding_allows_workspace(tenant_id)
  );

create function app_private.create_visit_appointment_link(
  p_tenant_id uuid, p_visit_id uuid, p_digest text, p_hours integer, p_operation_id uuid
) returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  visit public.service_visits%rowtype;
  existing public.visit_appointment_links%rowtype;
  zone text;
  deadline timestamptz;
begin
  if actor is null or not coalesce(public.has_role(p_tenant_id,array['owner','admin']::public.app_role[]),false)
     or not coalesce(public.tenant_can_write(p_tenant_id),false)
     or not coalesce(public.company_onboarding_allows_workspace(p_tenant_id),false) then
    raise exception 'No puedes crear enlaces para esta empresa' using errcode = '42501';
  end if;
  if p_operation_id is null or p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
     or p_hours is null or p_hours not in (24,72,168) then
    raise exception 'Datos del enlace no válidos' using errcode = '22023';
  end if;
  select * into visit from public.service_visits where id = p_visit_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
  select * into existing from public.visit_appointment_links where create_operation_id = p_operation_id;
  if found then
    if row(existing.tenant_id,existing.visit_id,existing.token_hash,existing.created_by,existing.requested_hours)
         is distinct from row(p_tenant_id,p_visit_id,p_digest,actor,p_hours) then
      raise exception 'Esta clave de operación ya se utilizó' using errcode = '23505';
    end if;
    if existing.revoked_at is not null or existing.visit_revision <> visit.updated_at
       or existing.expires_at <= clock_timestamp() then
      raise exception 'El enlace anterior ha dejado de estar activo' using errcode = 'P0409';
    end if;
    return existing.expires_at;
  end if;
  if visit.status <> 'scheduled' or visit.scheduled_start_at <= clock_timestamp() then
    raise exception 'Solo se comparten visitas programadas y futuras' using errcode = 'P0409';
  end if;
  if exists (select 1 from public.visit_appointment_links
    where tenant_id = p_tenant_id and visit_id = p_visit_id and visit_revision = visit.updated_at
      and (response = 'confirmed' or (response = 'change' and office_decision is null))) then
    raise exception 'La cita ya tiene una respuesta para este horario' using errcode = 'P0409';
  end if;
  select coalesce((select l.timezone from public.service_locations l
    where l.id = visit.location_id and l.tenant_id = p_tenant_id),'Europe/Madrid') into zone;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = zone) then
    raise exception 'La ubicación no tiene una zona horaria válida' using errcode = '22023';
  end if;
  deadline := least(visit.scheduled_start_at,clock_timestamp()+pg_catalog.make_interval(hours=>p_hours));
  update public.visit_appointment_links set revoked_at=clock_timestamp(),revoked_by=actor
    where tenant_id=p_tenant_id and visit_id=p_visit_id and revoked_at is null;
  insert into public.visit_appointment_links(tenant_id,visit_id,visit_revision,original_start,original_end,
    timezone,token_hash,expires_at,requested_hours,created_by,create_operation_id)
    values (p_tenant_id,p_visit_id,visit.updated_at,visit.scheduled_start_at,visit.scheduled_end_at,
      zone,p_digest,deadline,p_hours,actor,p_operation_id);
  return deadline;
end;
$$;

create function app_private.revoke_visit_appointment_link(p_tenant_id uuid,p_link_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  -- Revocation remains available when the subscription no longer permits new writes.
  if actor is null or not coalesce(public.has_role(p_tenant_id,array['owner','admin']::public.app_role[]),false) then
    raise exception 'No puedes revocar enlaces de esta empresa' using errcode = '42501';
  end if;
  update public.visit_appointment_links set revoked_at=clock_timestamp(),revoked_by=actor
    where id=p_link_id and tenant_id=p_tenant_id and revoked_at is null;
  return found or exists(select 1 from public.visit_appointment_links where id=p_link_id and tenant_id=p_tenant_id);
end;
$$;

create function app_private.active_visit_appointment_link(p_token text)
returns public.visit_appointment_links language sql stable security invoker set search_path = ''
return (
  select l from public.visit_appointment_links l join public.service_visits v
    on v.id=l.visit_id and v.tenant_id=l.tenant_id
  left join public.service_locations z on z.id=v.location_id and z.tenant_id=v.tenant_id
  where p_token ~ '^[0-9a-f]{64}$' and l.token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex')
    and l.revoked_at is null and l.expires_at>clock_timestamp()
    and v.status='scheduled' and v.updated_at=l.visit_revision
    and l.timezone=coalesce(z.timezone,'Europe/Madrid')
    and public.tenant_can_write(l.tenant_id)
);

create function app_private.read_visit_appointment_link(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare link public.visit_appointment_links%rowtype;
begin
  perform pg_catalog.set_config('response.headers','[{"Cache-Control":"no-store"}]',true);
  if coalesce(pg_catalog.current_setting('request.method',true),'') <> 'POST' then return null; end if;
  link := app_private.active_visit_appointment_link(p_token);
  if link.id is null then return null; end if;
  return pg_catalog.jsonb_build_object('startAt',link.original_start,'endAt',link.original_end,'timezone',link.timezone,
    'response',link.response,'proposedAt',link.proposed_start,'declined',link.office_decision is not distinct from 'declined');
end;
$$;

create function app_private.respond_visit_appointment_link(p_token text,p_response text,p_local_start timestamp)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  link public.visit_appointment_links%rowtype;
  link_id uuid;
  next_start timestamptz;
begin
  perform pg_catalog.set_config('response.headers','[{"Cache-Control":"no-store"}]',true);
  if coalesce(pg_catalog.current_setting('request.method',true),'') <> 'POST' then return null; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  link := app_private.active_visit_appointment_link(p_token);
  if link.id is null then return null; end if;
  if p_response is null or p_response not in ('confirmed','change')
     or ((p_response='change') is distinct from (p_local_start is not null)) then
    raise exception 'Respuesta no válida' using errcode = '22023';
  end if;
  link_id := link.id;
  -- Lock visit first, preserving existing office schedule/revision locking order.
  perform 1 from public.service_visits where id=link.visit_id and tenant_id=link.tenant_id for update;
  perform 1 from public.visit_appointment_links where id=link_id for update;
  link := app_private.active_visit_appointment_link(p_token);
  if link.id is null then return null; end if;
  if link.response is null then
    -- Only a live capability gets a short cooldown. No IP, device, cookie or
    -- invalid-token identifiers are collected. Identical successful retries remain safe.
    if link.accept_next_response_after > clock_timestamp() then
      return pg_catalog.jsonb_build_object('error','rate_limited');
    end if;
    update public.visit_appointment_links
      set accept_next_response_after=clock_timestamp()+interval '2 seconds' where id=link.id;
  end if;
  if p_response = 'change' then
    next_start := p_local_start at time zone link.timezone;
    if not pg_catalog.isfinite(next_start) or (next_start at time zone link.timezone) <> p_local_start
       or ((next_start - interval '1 hour') at time zone link.timezone) = p_local_start
       or ((next_start + interval '1 hour') at time zone link.timezone) = p_local_start then
      return pg_catalog.jsonb_build_object('error','invalid_proposal');
    end if;
  end if;
  if link.response is not null then
    -- One accepted response per bearer, safe to retry the same payload.
    if link.response is distinct from p_response or link.proposed_start is distinct from next_start then
      raise exception 'Enlace no disponible para otra respuesta' using errcode = 'P0409';
    end if;
    return app_private.read_visit_appointment_link(p_token);
  end if;
  if next_start is not null and (not pg_catalog.isfinite(next_start) or next_start <= clock_timestamp()
    or next_start > clock_timestamp()+interval '90 days' or next_start = link.original_start) then
    return pg_catalog.jsonb_build_object('error','invalid_proposal');
  end if;
  if not coalesce(public.tenant_can_write(link.tenant_id),false) then return null; end if;
  update public.visit_appointment_links set response=p_response,proposed_start=next_start,responded_at=clock_timestamp()
    where id=link.id;
  return app_private.read_visit_appointment_link(p_token);
end;
$$;

create function app_private.decide_visit_appointment_change(
  p_tenant_id uuid,p_link_id uuid,p_decision text,p_operation_id uuid
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  link public.visit_appointment_links%rowtype;
  visit public.service_visits%rowtype;
  zone text;
begin
  if actor is null or not coalesce(public.has_role(p_tenant_id,array['owner','admin']::public.app_role[]),false)
     or not coalesce(public.tenant_can_write(p_tenant_id),false)
     or not coalesce(public.company_onboarding_allows_workspace(p_tenant_id),false) then
    raise exception 'No puedes revisar solicitudes de esta empresa' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved','declined') or p_operation_id is null then
    raise exception 'Decisión no válida' using errcode = '22023';
  end if;
  select * into link from public.visit_appointment_links where id=p_link_id and tenant_id=p_tenant_id;
  if not found then raise exception 'Solicitud no encontrada' using errcode = 'P0002'; end if;
  select * into visit from public.service_visits where id=link.visit_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
  select * into link from public.visit_appointment_links where id=p_link_id and tenant_id=p_tenant_id for update;
  if link.response is distinct from 'change' then
    raise exception 'No hay ninguna propuesta para esta cita' using errcode = 'P0409';
  end if;
  if link.office_decision is not null then
    if link.decision_operation_id=p_operation_id and link.office_decision=p_decision and link.decided_by=actor then return true; end if;
    raise exception 'La solicitud ya se revisó' using errcode = 'P0409';
  end if;
  if p_decision = 'approved' then
    select coalesce((select l.timezone from public.service_locations l where l.id=visit.location_id
      and l.tenant_id=p_tenant_id),'Europe/Madrid') into zone;
    if visit.status <> 'scheduled' or visit.updated_at <> link.visit_revision or link.timezone <> zone
       or visit.scheduled_start_at<=clock_timestamp() or link.proposed_start<=clock_timestamp() then
      raise exception 'La visita o la propuesta ya no están vigentes. Revisa la agenda.' using errcode = 'P0409';
    end if;
    -- Reuse the normal office command and its schedule/assignment validation,
    -- preserve the exact duration, and let existing integrations see the same event.
    perform public.replan_service_visit(p_tenant_id,visit.id,visit.updated_at,link.proposed_start,
      link.proposed_start+(link.original_end-link.original_start),visit.assigned_user_id,
      'Cambio de cita propuesto por el cliente y confirmado por oficina',p_operation_id);
  end if;
  update public.visit_appointment_links set office_decision=p_decision,decided_at=clock_timestamp(),
    decided_by=actor,decision_operation_id=p_operation_id where id=link.id;
  return true;
end;
$$;

-- Parsed SQL wrappers call checked functions in a schema not exposed to PostgREST.
create function public.create_visit_appointment_link(p_tenant_id uuid,p_visit_id uuid,p_digest text,p_hours integer,p_operation_id uuid)
returns timestamptz language sql security invoker set search_path = ''
return app_private.create_visit_appointment_link(p_tenant_id,p_visit_id,p_digest,p_hours,p_operation_id);
create function public.revoke_visit_appointment_link(p_tenant_id uuid,p_link_id uuid)
returns boolean language sql security invoker set search_path = ''
return app_private.revoke_visit_appointment_link(p_tenant_id,p_link_id);
create function public.read_visit_appointment_link(p_token text)
returns jsonb language sql security invoker set search_path = ''
return app_private.read_visit_appointment_link(p_token);
create function public.respond_visit_appointment_link(p_token text,p_response text,p_local_start timestamp)
returns jsonb language sql security invoker set search_path = ''
return app_private.respond_visit_appointment_link(p_token,p_response,p_local_start);
create function public.decide_visit_appointment_change(p_tenant_id uuid,p_link_id uuid,p_decision text,p_operation_id uuid)
returns boolean language sql security invoker set search_path = ''
return app_private.decide_visit_appointment_change(p_tenant_id,p_link_id,p_decision,p_operation_id);

revoke all on function app_private.active_visit_appointment_link(text)
  from public, anon, authenticated, service_role;
do $roles$
declare schema_name text;
begin
  foreach schema_name in array array['app_private','public'] loop
    execute pg_catalog.format('revoke all on function %I.create_visit_appointment_link(uuid,uuid,text,integer,uuid), %I.revoke_visit_appointment_link(uuid,uuid), %I.decide_visit_appointment_change(uuid,uuid,text,uuid), %I.read_visit_appointment_link(text), %I.respond_visit_appointment_link(text,text,timestamp) from public, anon, authenticated, service_role',
      schema_name,schema_name,schema_name,schema_name,schema_name);
    execute pg_catalog.format('grant execute on function %I.create_visit_appointment_link(uuid,uuid,text,integer,uuid), %I.revoke_visit_appointment_link(uuid,uuid), %I.decide_visit_appointment_change(uuid,uuid,text,uuid) to authenticated',
      schema_name,schema_name,schema_name);
    execute pg_catalog.format('grant execute on function %I.read_visit_appointment_link(text), %I.respond_visit_appointment_link(text,text,timestamp) to anon, authenticated',
      schema_name,schema_name);
  end loop;
end;
$roles$;
notify pgrst, 'reload schema';
