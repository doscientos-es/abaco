-- A report share points to one immutable closed version. The bearer token itself
-- is never stored; only its SHA-256 hash is retained for lookup and revocation.
alter table public.service_visit_report_versions
  add constraint service_visit_report_versions_id_tenant_unique unique (id, tenant_id);

create table public.service_visit_report_shares (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  tenant_id uuid not null,
  report_version_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_operation_id uuid unique,
  foreign key (report_version_id, tenant_id)
    references public.service_visit_report_versions (id, tenant_id) on delete restrict,
  check ((revoked_at is null and revoked_by is null and revoke_operation_id is null)
    or (revoked_at is not null and revoked_by is not null
      and revoke_operation_id is not null))
);
create index service_visit_report_shares_version_idx
  on public.service_visit_report_shares (tenant_id, report_version_id, created_at desc);
alter table public.service_visit_report_shares enable row level security;
revoke all on public.service_visit_report_shares from public, anon, authenticated;
grant select on public.service_visit_report_shares to authenticated, service_role;
create policy service_visit_report_shares_select
  on public.service_visit_report_shares for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin']::public.app_role[])
  );

create function public.create_service_visit_report_share(
  p_tenant_id uuid, p_report_version_id uuid, p_token text,
  p_expires_at timestamptz, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  prior public.service_visit_report_shares%rowtype;
  token_digest text;
  new_id uuid;
begin
  if p_tenant_id is null or p_report_version_id is null or p_operation_id is null
     or p_token is null or p_token !~ '^[0-9a-f]{64}$'
     or p_expires_at is null then
    raise exception 'Datos del enlace inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
    array['owner', 'admin']::public.app_role[]) then
    raise exception 'No tienes permiso para compartir el parte' using errcode = '42501';
  end if;
  token_digest := pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex');
  -- Serialize concurrent retries of the same operation before checking history.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0));
  select * into prior from public.service_visit_report_shares
    where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id
       or prior.report_version_id <> p_report_version_id
       or prior.token_hash <> token_digest
       or prior.expires_at <> p_expires_at then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if p_expires_at <= clock_timestamp()
     or p_expires_at > clock_timestamp() + interval '90 days' then
    raise exception 'Datos del enlace inválidos' using errcode = '22023';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede crear enlaces' using errcode = 'P0402';
  end if;
  if not exists (select 1 from public.service_visit_report_versions
    where id = p_report_version_id and tenant_id = p_tenant_id) then
    raise exception 'Parte cerrado no encontrado' using errcode = 'P0002';
  end if;
  insert into public.service_visit_report_shares
    (operation_id, tenant_id, report_version_id, token_hash,
     expires_at, created_by)
  values (p_operation_id, p_tenant_id, p_report_version_id,
    token_digest, p_expires_at, (select auth.uid()))
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.create_service_visit_report_share(
  uuid, uuid, text, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.create_service_visit_report_share(
  uuid, uuid, text, timestamptz, uuid
) to authenticated;

create function public.revoke_service_visit_report_share(
  p_tenant_id uuid, p_share_id uuid, p_operation_id uuid
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_visit_report_shares%rowtype;
begin
  if p_tenant_id is null or p_share_id is null or p_operation_id is null then
    raise exception 'Datos de revocación inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
    array['owner', 'admin']::public.app_role[]) then
    raise exception 'No tienes permiso para revocar el enlace' using errcode = '42501';
  end if;
  select * into target from public.service_visit_report_shares
    where id = p_share_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Enlace no encontrado' using errcode = 'P0002'; end if;
  if target.revoked_at is not null then
    if target.revoke_operation_id <> p_operation_id then
      raise exception 'Este enlace ya fue revocado' using errcode = 'P0409';
    end if;
    return true;
  end if;
  update public.service_visit_report_shares
    set revoked_at = clock_timestamp(), revoked_by = (select auth.uid()),
      revoke_operation_id = p_operation_id
    where id = p_share_id;
  return true;
end;
$$;
revoke all on function public.revoke_service_visit_report_share(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.revoke_service_visit_report_share(
  uuid, uuid, uuid
) to authenticated;
