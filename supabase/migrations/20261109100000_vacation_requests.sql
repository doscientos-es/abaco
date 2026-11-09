-- Vacation requests are separate from visit planning. Approval records a decision
-- but deliberately does not reassign, cancel, or block any service visit.
create table public.vacation_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete restrict,
  requester_name text not null check (char_length(btrim(requester_name)) between 1 and 160),
  start_date date not null,
  end_date date not null,
  requester_comment text not null default '' check (char_length(requester_comment) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default clock_timestamp(),
  decided_by uuid references public.profiles (id) on delete restrict,
  decided_by_name text not null default '' check (char_length(decided_by_name) <= 160),
  decided_at timestamptz,
  decision_comment text not null default '' check (char_length(decision_comment) <= 1000),
  unique (id, tenant_id),
  check (start_date <= end_date),
  check (
    (status = 'pending' and decided_by is null and decided_by_name = ''
      and decided_at is null and decision_comment = '')
    or (status in ('approved', 'rejected') and decided_by is not null
      and char_length(decided_by_name) > 0 and decided_at is not null)
  )
);

create index vacation_requests_tenant_history_idx
  on public.vacation_requests (tenant_id, submitted_at desc);
create index vacation_requests_requester_history_idx
  on public.vacation_requests (tenant_id, requester_id, submitted_at desc);
create index vacation_requests_pending_idx
  on public.vacation_requests (tenant_id, submitted_at desc) where status = 'pending';

alter table public.vacation_requests enable row level security;
revoke all on public.vacation_requests from public, anon, authenticated;
grant select on public.vacation_requests to authenticated, service_role;
create policy vacation_requests_select on public.vacation_requests
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin']::public.app_role[])
    or (requester_id = (select auth.uid()) and public.has_role(
      tenant_id, array['technician']::public.app_role[]
    ))
  );

create function public.submit_vacation_request(
  p_tenant_id uuid, p_start_date date, p_end_date date, p_comment text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  clean_comment text := pg_catalog.btrim(coalesce(p_comment, ''));
  requester_name text;
  request_id uuid;
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['technician']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para solicitar vacaciones' using errcode = '42501';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede gestionar vacaciones' using errcode = 'P0402';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date
    or pg_catalog.char_length(clean_comment) > 1000 then
    raise exception 'Datos de vacaciones inválidos' using errcode = '22023';
  end if;

  select pg_catalog.left(
    coalesce(nullif(pg_catalog.btrim(p.full_name), ''), p.email), 160
  ) into requester_name
  from public.profiles p where p.id = (select auth.uid());
  if requester_name is null or requester_name = '' then
    raise exception 'No se encontró el perfil del trabajador' using errcode = 'P0002';
  end if;

  insert into public.vacation_requests (
    tenant_id, requester_id, requester_name, start_date, end_date, requester_comment
  ) values (
    p_tenant_id, (select auth.uid()), requester_name,
    p_start_date, p_end_date, clean_comment
  ) returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.submit_vacation_request(uuid, date, date, text)
  from public, anon, authenticated;
grant execute on function public.submit_vacation_request(uuid, date, date, text)
  to authenticated;

create function public.decide_vacation_request(
  p_tenant_id uuid, p_request_id uuid, p_decision text, p_comment text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target public.vacation_requests%rowtype;
  clean_comment text := pg_catalog.btrim(coalesce(p_comment, ''));
  decision_name text;
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para gestionar vacaciones' using errcode = '42501';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede gestionar vacaciones' using errcode = 'P0402';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected')
    or pg_catalog.char_length(clean_comment) > 1000 then
    raise exception 'Decisión de vacaciones inválida' using errcode = '22023';
  end if;

  select * into target from public.vacation_requests
  where id = p_request_id and tenant_id = p_tenant_id for update;
  if not found then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;
  if target.status <> 'pending' then
    raise exception 'La solicitud ya tiene una decisión' using errcode = 'P0409';
  end if;

  select pg_catalog.left(
    coalesce(nullif(pg_catalog.btrim(p.full_name), ''), p.email), 160
  ) into decision_name
  from public.profiles p where p.id = (select auth.uid());
  if decision_name is null or decision_name = '' then
    raise exception 'No se encontró el perfil de administración' using errcode = 'P0002';
  end if;

  update public.vacation_requests set
    status = p_decision,
    decided_by = (select auth.uid()),
    decided_by_name = decision_name,
    decided_at = clock_timestamp(),
    decision_comment = clean_comment
  where id = target.id and tenant_id = p_tenant_id;
  return target.id;
end;
$$;
revoke all on function public.decide_vacation_request(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.decide_vacation_request(uuid, uuid, text, text)
  to authenticated;