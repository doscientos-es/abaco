-- Vacation requests may be installed after the admin/user role migration.
alter policy vacation_requests_select on public.vacation_requests
  using (
    public.has_role(tenant_id, array['owner', 'admin']::public.app_role[])
    or (requester_id = (select auth.uid()) and public.has_role(
      tenant_id, array['technician', 'user']::public.app_role[]
    ))
  );

create or replace function public.submit_vacation_request(
  p_tenant_id uuid, p_start_date date, p_end_date date, p_comment text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  clean_comment text := pg_catalog.btrim(coalesce(p_comment, ''));
  requester_name text;
  request_id uuid;
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['technician', 'user']::public.app_role[]
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