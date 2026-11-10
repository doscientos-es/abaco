alter table public.service_visits
  add column actual_start_latitude double precision,
  add column actual_start_longitude double precision,
  add constraint service_visits_start_location_pair check (
    (actual_start_latitude is null and actual_start_longitude is null)
    or (
      actual_start_latitude is not null and actual_start_longitude is not null
      and actual_start_latitude between -90 and 90
      and actual_start_longitude between -180 and 180
    )
  );

alter table public.tenants
  add column collect_visit_start_location boolean not null default false;

-- Replace the six-argument overload so existing callers use these defaults too.
drop function public.transition_service_visit(uuid, uuid, timestamptz, text, text, uuid);

create or replace function public.transition_service_visit(
  p_tenant_id uuid, p_visit_id uuid, p_expected_updated_at timestamptz,
  p_next_status text, p_reason text, p_operation_id uuid,
  p_start_latitude double precision default null,
  p_start_longitude double precision default null
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_visits%rowtype;
  prior public.service_visit_events%rowtype;
  office boolean;
  technician boolean;
  collect_location boolean;
  clean_reason text := trim(coalesce(p_reason, ''));
begin
  if p_tenant_id is null or p_visit_id is null or p_expected_updated_at is null
     or p_operation_id is null or p_next_status is null
     or p_next_status not in ('in_progress', 'completed', 'skipped', 'canceled')
     or char_length(clean_reason) > 500
     or ((p_start_latitude is null) <> (p_start_longitude is null))
     or (p_start_latitude is not null and p_start_latitude not between -90 and 90)
     or (p_start_longitude is not null and p_start_longitude not between -180 and 180) then
    raise exception 'Datos de cambio de visita inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  select * into target from public.service_visits
    where id = p_visit_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
  office := public.has_role(p_tenant_id,
    array['owner', 'admin', 'editor']::public.app_role[]);
  technician := target.assigned_user_id = (select auth.uid())
    and public.has_role(p_tenant_id, array['technician']::public.app_role[]);
  if not office and not technician then
    raise exception 'No tienes permiso para cambiar la visita' using errcode = '42501';
  end if;
  select * into prior from public.service_visit_events where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.visit_id <> p_visit_id
       or prior.kind <> 'status_changed'
       or prior.payload->>'to' <> p_next_status
       or prior.payload->>'reason' <> clean_reason
       or (prior.payload->>'startLatitude') is distinct from p_start_latitude::text
       or (prior.payload->>'startLongitude') is distinct from p_start_longitude::text then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return p_next_status;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede cambiar visitas' using errcode = 'P0402';
  end if;
  if target.updated_at <> p_expected_updated_at then
    raise exception 'La visita cambió en otra sesión; recarga la agenda' using errcode = 'P0409';
  end if;
  if technician and p_next_status not in ('in_progress', 'completed') then
    raise exception 'Solo oficina puede omitir o cancelar visitas' using errcode = '42501';
  end if;
  if not (
    (target.status = 'scheduled' and p_next_status in ('in_progress', 'skipped', 'canceled'))
    or (target.status = 'in_progress' and p_next_status in ('completed', 'canceled'))
  ) then
    raise exception 'Transición de visita no permitida' using errcode = 'P0409';
  end if;
  if p_next_status in ('skipped', 'canceled') and clean_reason = '' then
    raise exception 'Indica el motivo de la cancelación' using errcode = '22023';
  end if;
  select coalesce(t.collect_visit_start_location, false) into collect_location
    from public.tenants t where t.id = p_tenant_id;
  if p_next_status = 'in_progress' and collect_location and technician
     and p_start_latitude is null then
    raise exception 'La empresa requiere ubicación al iniciar esta visita'
      using errcode = '22023';
  end if;
  if (p_next_status <> 'in_progress' or not collect_location or not technician)
     and (p_start_latitude is not null or p_start_longitude is not null) then
    raise exception 'No se admite ubicación para este cambio' using errcode = '22023';
  end if;
  update public.service_visits
    set status = p_next_status,
        actual_start_at = case when p_next_status = 'in_progress' then now() else actual_start_at end,
        actual_end_at = case when p_next_status = 'completed' then now() else actual_end_at end,
        actual_start_latitude = case when p_next_status = 'in_progress'
          then p_start_latitude else actual_start_latitude end,
        actual_start_longitude = case when p_next_status = 'in_progress'
          then p_start_longitude else actual_start_longitude end
    where id = target.id;
  insert into public.service_visit_events (
    operation_id, tenant_id, visit_id, kind, payload, actor_id
  ) values (
    p_operation_id, p_tenant_id, p_visit_id, 'status_changed',
    jsonb_build_object('from', target.status, 'to', p_next_status,
      'reason', clean_reason, 'startLatitude', p_start_latitude,
      'startLongitude', p_start_longitude), (select auth.uid())
  );
  return p_next_status;
end;
$$;
revoke all on function public.transition_service_visit(
  uuid, uuid, timestamptz, text, text, uuid, double precision, double precision
) from public, anon, authenticated;
grant execute on function public.transition_service_visit(
  uuid, uuid, timestamptz, text, text, uuid, double precision, double precision
) to authenticated;

drop function public.my_company_memberships();

create function public.my_company_memberships()
returns table (tenant_id uuid, role public.app_role, company_name text,
  collect_visit_start_location boolean)
language sql stable security definer set search_path = ''
as $$
  select m.tenant_id, m.role, t.name, t.collect_visit_start_location
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = (select auth.uid())
  order by m.created_at, m.tenant_id;
$$;
revoke all on function public.my_company_memberships() from public, anon, authenticated;
grant execute on function public.my_company_memberships() to authenticated;
