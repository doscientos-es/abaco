create table app_private.intervention_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null,
  centre_id uuid,
  fingerprint text not null unique check (fingerprint ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_attempt_at timestamptz,
  pending_operation uuid,
  pending_with_photos boolean,
  photo_attempts smallint not null default 0 check (photo_attempts between 0 and 8),
  budgeted_photo_attempt smallint not null default 0 check (budgeted_photo_attempt between 0 and photo_attempts),
  budgeted_photo_count smallint not null default 0 check (budgeted_photo_count between 0 and 3),
  text_attempts smallint not null default 0 check (text_attempts between 0 and 3),
  foreign key (client_id,tenant_id) references public.clients(id,tenant_id) on delete cascade,
  unique(id,tenant_id)
);
create index intervention_invites_client_idx on app_private.intervention_invites(tenant_id,client_id,created_at desc);
create index intervention_invites_budget_idx on app_private.intervention_invites(tenant_id,created_at);
create table app_private.intervention_requests (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null unique,
  tenant_id uuid not null,
  operation_id uuid not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  address text not null check (char_length(address) between 3 and 250),
  availability text not null check (char_length(availability) between 3 and 400),
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
  approved_at timestamptz not null default now(),
  status_by uuid references auth.users(id) on delete set null,
  status_at timestamptz,
  foreign key (invite_id,tenant_id) references app_private.intervention_invites(id,tenant_id) on delete cascade,
  unique(id,tenant_id)
);
create table app_private.intervention_photos (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  tenant_id uuid not null,
  position smallint not null check (position between 1 and 3),
  jpeg bytea not null check (octet_length(jpeg) between 4 and 256000),
  foreign key (request_id,tenant_id) references app_private.intervention_requests(id,tenant_id) on delete cascade,
  unique(request_id,position)
);
-- One private aggregate per UTC month, independent of customer, actor and image identity.
create table app_private.intervention_image_budget (
  month_start date primary key,
  reservations integer not null check (reservations between 1 and 500)
);
alter table app_private.intervention_image_budget enable row level security;
alter table app_private.intervention_invites enable row level security;
alter table app_private.intervention_requests enable row level security;
alter table app_private.intervention_photos enable row level security;
revoke all on table app_private.intervention_invites,app_private.intervention_requests,app_private.intervention_photos,
  app_private.intervention_image_budget
  from public,anon,authenticated,service_role;

create function app_private.require_intake_office(p_tenant uuid,p_write boolean)
returns void language plpgsql set search_path='' as $$
begin
  if p_tenant is null or (select auth.uid()) is null or not coalesce(
    public.has_role(p_tenant,array['owner','admin']::public.app_role[]),false
  ) then raise exception 'Sin permiso de oficina' using errcode='42501'; end if;
  if p_write and not coalesce(public.tenant_can_write(p_tenant),false) then
    raise exception 'La empresa no admite cambios' using errcode='P0402';
  end if;
end
$$;
-- Bounded primary-key lookups, shared by issuance and every public action.
create function app_private.intervention_scope_is_active(p_tenant uuid,p_client uuid,p_centre uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select p_tenant is not null and p_client is not null
    and coalesce(public.tenant_can_write(p_tenant),false)
    and exists(select 1 from public.clients c
      where c.id=p_client and c.tenant_id=p_tenant and c.archived_at is null)
    and (p_centre is null or exists(select 1 from public.service_locations l
      where l.id=p_centre and l.tenant_id=p_tenant and l.client_id=p_client
        and l.active and l.kind<>'billing'));
$$;

create function app_private.create_intervention_invite(p_tenant uuid,p_client uuid,p_centre uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare secret text; created app_private.intervention_invites%rowtype;
begin
  perform app_private.require_intake_office(p_tenant,true);
  if p_client is null then raise exception 'Falta el cliente' using errcode='22023'; end if;
  perform 1 from public.tenants t where t.id=p_tenant for update;
  if not app_private.intervention_scope_is_active(p_tenant,p_client,p_centre) then
    raise exception 'El cliente o el centro no están disponibles' using errcode='P0002';
  end if;
  if (select count(*) from app_private.intervention_invites i where i.tenant_id=p_tenant
      and i.created_at>now()-interval '1 hour') >= 10 then
    raise exception 'Límite de invitaciones. Inténtalo más tarde' using errcode='P0429';
  end if;
  if (select count(*) from app_private.intervention_invites i
      where i.tenant_id=p_tenant and i.revoked_at is null and i.expires_at>clock_timestamp()
      and not exists(select 1 from app_private.intervention_requests r
        where r.invite_id=i.id and r.tenant_id=i.tenant_id)) >= 10 then
    raise exception 'Límite de enlaces activos. Revoca uno o espera a que caduque' using errcode='P0429';
  end if;
  secret:=encode(extensions.gen_random_bytes(32),'hex');
  insert into app_private.intervention_invites(tenant_id,client_id,centre_id,fingerprint,created_by,expires_at)
  values(p_tenant,p_client,p_centre,encode(extensions.digest(secret,'sha256'),'hex'),(select auth.uid()),now()+interval '72 hours')
  returning * into created;
  return jsonb_build_object('id',created.id,'token',secret,'expires_at',created.expires_at);
end
$$;

create function app_private.list_intervention_intake(p_tenant uuid,p_client uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.require_intake_office(p_tenant,false);
  return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'centre_name',l.name,
      'created_at',i.created_at,'expires_at',i.expires_at,'revoked_at',i.revoked_at,
      'request',case when r.id is not null then jsonb_build_object('id',r.id,'address',r.address,
        'availability',r.availability,'status',r.status,'received_at',r.approved_at,
        'photo_ids',coalesce((select jsonb_agg(p.id order by p.position)
          from app_private.intervention_photos p where p.request_id=r.id and p.tenant_id=i.tenant_id),'[]'::jsonb))
      end) order by (r.status is not distinct from 'pending') desc,i.created_at desc)
    from (select a.* from app_private.intervention_invites a
      left join app_private.intervention_requests active on active.invite_id=a.id and active.tenant_id=a.tenant_id
      where a.tenant_id=p_tenant and a.client_id=p_client
      order by (active.status is not distinct from 'pending') desc,a.created_at desc limit 50) i
    left join public.service_locations l on l.id=i.centre_id and l.tenant_id=i.tenant_id and l.client_id=i.client_id
    left join app_private.intervention_requests r on r.invite_id=i.id and r.tenant_id=i.tenant_id), '[]'::jsonb);
end
$$;

create function app_private.update_intervention_intake(p_tenant uuid,p_invite uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform app_private.require_intake_office(p_tenant,true);
  perform 1 from app_private.intervention_invites i where i.id=p_invite and i.tenant_id=p_tenant for update;
  if not found then raise exception 'Invitación no disponible' using errcode='P0002'; end if;
  if p_action='revoke' then
    if exists (select 1 from app_private.intervention_requests r where r.invite_id=p_invite) then
      raise exception 'La solicitud ya se recibió' using errcode='P0409';
    end if;
    update app_private.intervention_invites set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=p_invite;
  elsif p_action in ('reviewed','dismissed') then
    update app_private.intervention_requests
      set status=p_action,status_by=(select auth.uid()),status_at=clock_timestamp()
      where invite_id=p_invite and tenant_id=p_tenant and status='pending';
    if not found then raise exception 'La solicitud ya no está pendiente' using errcode='P0409'; end if;
  else raise exception 'Acción no válida' using errcode='22023'; end if;
end
$$;

create function app_private.read_intervention_photo(p_tenant uuid,p_photo uuid)
returns text language plpgsql stable security definer set search_path='' as $$
begin
  perform app_private.require_intake_office(p_tenant,false);
  return (select encode(jpeg,'base64') from app_private.intervention_photos where tenant_id=p_tenant and id=p_photo);
end
$$;

-- Only the public HTTP handler uses these narrowly scoped service-role RPCs.
create function app_private.guard_intervention_intake(p_token_hash text,p_op uuid,p_with_photos boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target app_private.intervention_invites%rowtype; existing app_private.intervention_requests%rowtype;
  reserved_attempt smallint;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into target from app_private.intervention_invites where fingerprint=p_token_hash for update;
  if not found or target.revoked_at is not null or target.expires_at<=clock_timestamp()
    or not app_private.intervention_scope_is_active(target.tenant_id,target.client_id,target.centre_id)
    then return null;
  end if;
  select * into existing from app_private.intervention_requests where invite_id=target.id;
  if found then
    if p_op is not null and existing.operation_id=p_op then
      return jsonb_build_object('state','replay','receipt',existing.id,'digest',existing.fingerprint);
    end if;
    return null;
  end if;
  if p_op is not null then
    if p_with_photos is null then return null; end if;
    if p_with_photos and target.photo_attempts >= 8 then
      return jsonb_build_object('state','photo_limited');
    end if;
    if (not p_with_photos and target.text_attempts >= 3)
      or target.last_attempt_at > clock_timestamp()-interval '4 seconds' then
      return jsonb_build_object('state','limited');
    end if;
    update app_private.intervention_invites set
      photo_attempts=photo_attempts+case when p_with_photos then 1 else 0 end,
      text_attempts=text_attempts+case when p_with_photos then 0 else 1 end,
      last_attempt_at=clock_timestamp(),pending_operation=p_op,pending_with_photos=p_with_photos
      where id=target.id returning photo_attempts into reserved_attempt;
    if p_with_photos then
      return jsonb_build_object('state','pending','photo_attempt',reserved_attempt);
    end if;
  end if;
  return jsonb_build_object('state','pending');
end
$$;

-- Reserve conservatively before IMAGES. False means exhausted; null means invalid/raced.
create function app_private.claim_intervention_image_budget(
  p_token_hash text,p_op uuid,p_attempt integer,p_count integer
) returns boolean language plpgsql security definer set search_path='' as $$
declare target app_private.intervention_invites%rowtype; remaining integer;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_op is null
    or p_attempt is null or p_attempt not between 1 and 8
    or p_count is null or p_count not between 1 and 3 then return null; end if;
  select * into target from app_private.intervention_invites where fingerprint=p_token_hash for update;
  if not found or target.revoked_at is not null or target.expires_at<=clock_timestamp()
    or target.pending_operation is distinct from p_op or target.pending_with_photos is distinct from true
    or target.photo_attempts is distinct from p_attempt or target.budgeted_photo_attempt>=p_attempt
    or not app_private.intervention_scope_is_active(target.tenant_id,target.client_id,target.centre_id)
    or exists(select 1 from app_private.intervention_requests r where r.invite_id=target.id) then return null; end if;
  insert into app_private.intervention_image_budget as b (month_start,reservations)
    values(date_trunc('month',clock_timestamp() at time zone 'UTC')::date,p_count)
    on conflict (month_start) do update set reservations=b.reservations+excluded.reservations
      where b.reservations+excluded.reservations<=500
    returning reservations into remaining;
  if remaining is null then return false; end if;
  update app_private.intervention_invites set budgeted_photo_attempt=p_attempt,budgeted_photo_count=p_count where id=target.id;
  return true;
end
$$;

create function app_private.submit_intervention_intake(p_token_hash text,p_op uuid,p_digest text,
  p_address text,p_availability text,p_photos jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare target app_private.intervention_invites%rowtype; existing app_private.intervention_requests%rowtype;
  receipt uuid; photo jsonb; bytes bytea; n smallint:=0;
begin
  if p_op is null or p_token_hash is null or p_digest is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_digest !~ '^[0-9a-f]{64}$' or p_address is null or char_length(btrim(p_address)) not between 3 and 250
    or p_availability is null or char_length(btrim(p_availability)) not between 3 and 400
    or p_photos is null or jsonb_typeof(p_photos)<>'array' or octet_length(p_photos::text)>1025000 then
    raise exception 'Solicitud no válida' using errcode='22023';
  end if;
  if jsonb_array_length(p_photos)>3 then raise exception 'Demasiadas fotos' using errcode='22023'; end if;
  select * into target from app_private.intervention_invites where fingerprint=p_token_hash for update;
  if not found or target.revoked_at is not null or target.expires_at<=clock_timestamp()
    or not app_private.intervention_scope_is_active(target.tenant_id,target.client_id,target.centre_id)
    then return null;
  end if;
  select * into existing from app_private.intervention_requests where invite_id=target.id;
  if found then
    if existing.operation_id=p_op and existing.fingerprint=p_digest then return existing.id; end if;
    return null;
  end if;
  if target.pending_operation is distinct from p_op
    or target.pending_with_photos is distinct from (jsonb_array_length(p_photos)>0)
    or (target.pending_with_photos and (
      target.budgeted_photo_attempt is distinct from target.photo_attempts
      or target.budgeted_photo_count is distinct from jsonb_array_length(p_photos)
    ))
    then return null;
  end if;
  insert into app_private.intervention_requests (invite_id,tenant_id,operation_id,fingerprint,address,availability)
  values(target.id,target.tenant_id,p_op,p_digest,btrim(p_address),btrim(p_availability)) returning id into receipt;
  for photo in select value from jsonb_array_elements(p_photos) loop
    if jsonb_typeof(photo)<>'string' then raise exception 'Foto no válida' using errcode='22023'; end if;
    bytes:=decode(photo#>>'{}','base64');
    if octet_length(bytes) not between 4 and 256000 or substring(bytes from 1 for 2)<>decode('ffd8','hex')
      or substring(bytes from octet_length(bytes)-1 for 2)<>decode('ffd9','hex') then
      raise exception 'Foto no válida' using errcode='22023';
    end if;
    n:=n+1;
    insert into app_private.intervention_photos(request_id,tenant_id,position,jpeg)
    values(receipt,target.tenant_id,n,bytes);
  end loop;
  return receipt;
end
$$;

create function public.create_intervention_invite(p_tenant uuid,p_client uuid,p_centre uuid)
returns jsonb language sql security invoker set search_path=''
begin atomic select app_private.create_intervention_invite(p_tenant,p_client,p_centre); end;
create function public.list_intervention_intake(p_tenant uuid,p_client uuid)
returns jsonb language sql stable security invoker set search_path=''
begin atomic select app_private.list_intervention_intake(p_tenant,p_client); end;
create function public.update_intervention_intake(p_tenant uuid,p_invite uuid,p_action text)
returns void language sql security invoker set search_path=''
begin atomic select app_private.update_intervention_intake(p_tenant,p_invite,p_action); end;
create function public.read_intervention_photo(p_tenant uuid,p_photo uuid)
returns text language sql stable security invoker set search_path=''
begin atomic select app_private.read_intervention_photo(p_tenant,p_photo); end;
create function public.guard_intervention_intake(p_token_hash text,p_op uuid,p_with_photos boolean)
returns jsonb language sql security invoker set search_path=''
begin atomic select app_private.guard_intervention_intake(p_token_hash,p_op,p_with_photos); end;
create function public.claim_intervention_image_budget(p_token_hash text,p_op uuid,p_attempt integer,p_count integer)
returns boolean language sql security invoker set search_path=''
begin atomic select app_private.claim_intervention_image_budget(p_token_hash,p_op,p_attempt,p_count); end;
create function public.submit_intervention_intake(p_token_hash text,p_op uuid,p_digest text,
  p_address text,p_availability text,p_photos jsonb)
returns uuid language sql security invoker set search_path=''
begin atomic select app_private.submit_intervention_intake(p_token_hash,p_op,p_digest,p_address,p_availability,p_photos); end;

revoke all on function app_private.require_intake_office(uuid,boolean),
  app_private.intervention_scope_is_active(uuid,uuid,uuid),
  app_private.create_intervention_invite(uuid,uuid,uuid),app_private.list_intervention_intake(uuid,uuid),
  app_private.update_intervention_intake(uuid,uuid,text),app_private.read_intervention_photo(uuid,uuid),
  app_private.guard_intervention_intake(text,uuid,boolean),app_private.claim_intervention_image_budget(text,uuid,integer,integer),
  app_private.submit_intervention_intake(text,uuid,text,text,text,jsonb),
  public.create_intervention_invite(uuid,uuid,uuid),public.list_intervention_intake(uuid,uuid),
  public.update_intervention_intake(uuid,uuid,text),public.read_intervention_photo(uuid,uuid),
  public.guard_intervention_intake(text,uuid,boolean),public.claim_intervention_image_budget(text,uuid,integer,integer),
  public.submit_intervention_intake(text,uuid,text,text,text,jsonb)
  from public,anon,authenticated,service_role;

grant execute on function app_private.create_intervention_invite(uuid,uuid,uuid),app_private.list_intervention_intake(uuid,uuid),
  app_private.update_intervention_intake(uuid,uuid,text),app_private.read_intervention_photo(uuid,uuid),
  public.create_intervention_invite(uuid,uuid,uuid),public.list_intervention_intake(uuid,uuid),
  public.update_intervention_intake(uuid,uuid,text),public.read_intervention_photo(uuid,uuid)
  to authenticated;
grant execute on function app_private.guard_intervention_intake(text,uuid,boolean),
  app_private.claim_intervention_image_budget(text,uuid,integer,integer),
  app_private.submit_intervention_intake(text,uuid,text,text,text,jsonb),
  public.guard_intervention_intake(text,uuid,boolean),public.claim_intervention_image_budget(text,uuid,integer,integer),
  public.submit_intervention_intake(text,uuid,text,text,text,jsonb)
  to service_role;
notify pgrst,'reload schema';
