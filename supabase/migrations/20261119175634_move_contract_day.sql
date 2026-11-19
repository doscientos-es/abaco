create table app_private.contract_day_moves (
  operation_id uuid primary key,
  tenant_id uuid not null,
  actor_id uuid not null,
  request jsonb not null
);
revoke all on app_private.contract_day_moves from public, anon, authenticated;

create function public.replan_contract_day(
  p_tenant_id uuid, p_contract_id uuid, p_source_date date, p_visits jsonb,
  p_shift_minutes integer, p_operation_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v record;
  expected_count integer;
  actual_count integer;
  request_data jsonb;
  previous app_private.contract_day_moves%rowtype;
begin
  if auth.uid() is null or not public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para reprogramar trabajos' using errcode = '42501';
  end if;
  if p_contract_id is null or p_source_date is null or p_operation_id is null
     or p_shift_minutes is null or p_shift_minutes = 0 or abs(p_shift_minutes::bigint) > 525600
     or jsonb_typeof(p_visits) is distinct from 'array' then
    raise exception 'Cambio de contrato inválido' using errcode = '22023';
  end if;
  expected_count := jsonb_array_length(p_visits);
  if expected_count < 2 or expected_count > 500 then
    raise exception 'Número de trabajos inválido' using errcode = '22023';
  end if;
  request_data := jsonb_build_object('contract', p_contract_id, 'date', p_source_date,
    'visits', p_visits, 'shift', p_shift_minutes);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text, 182));
  select * into previous from app_private.contract_day_moves where operation_id = p_operation_id;
  if found then
    if previous.tenant_id <> p_tenant_id or previous.actor_id <> auth.uid() or previous.request <> request_data then
      raise exception 'La operación ya se utilizó para otro cambio' using errcode = '22023';
    end if;
    return;
  end if;
  perform 1 from public.service_visits sv where sv.tenant_id = p_tenant_id
    and sv.id in (select (entry->>'id')::uuid from jsonb_array_elements(p_visits) entry)
    order by sv.id for update;
  select count(*) into actual_count
  from public.service_visits sv
  left join public.service_locations l on l.id = sv.location_id and l.tenant_id = sv.tenant_id
  where sv.tenant_id = p_tenant_id and sv.contract_id = p_contract_id
    and (sv.scheduled_start_at at time zone coalesce(l.timezone, 'Europe/Madrid'))::date = p_source_date;
  if actual_count <> expected_count or
    (select count(distinct entry->>'id') from jsonb_array_elements(p_visits) entry) <> expected_count or
    exists (select 1 from jsonb_array_elements(p_visits) entry
      where not exists (select 1 from public.service_visits sv
        left join public.service_locations l on l.id = sv.location_id and l.tenant_id = sv.tenant_id
        where sv.id = (entry->>'id')::uuid and sv.tenant_id = p_tenant_id
          and sv.contract_id = p_contract_id and sv.status = 'scheduled'
          and sv.updated_at = (entry->>'updated_at')::timestamptz
          and (sv.scheduled_start_at at time zone coalesce(l.timezone, 'Europe/Madrid'))::date = p_source_date)) then
    raise exception 'Los trabajos del contrato han cambiado. Actualiza el calendario.' using errcode = 'P0409';
  end if;
  for v in select sv.*, coalesce(l.timezone, 'Europe/Madrid') as visit_timezone
    from public.service_visits sv
    left join public.service_locations l on l.id = sv.location_id and l.tenant_id = sv.tenant_id
    where sv.tenant_id = p_tenant_id
      and sv.id in (select (entry->>'id')::uuid from jsonb_array_elements(p_visits) entry)
    order by case when p_shift_minutes > 0 then sv.scheduled_start_at end desc,
             case when p_shift_minutes < 0 then sv.scheduled_start_at end asc, sv.id
  loop
    perform public.replan_service_visit_local(p_tenant_id, v.id, v.updated_at,
      (v.scheduled_start_at at time zone v.visit_timezone) + pg_catalog.make_interval(mins => p_shift_minutes),
      (extract(epoch from (v.scheduled_end_at - v.scheduled_start_at)) / 60)::integer,
      v.assigned_user_id, 'Cambio de contrato desde el calendario',
      pg_catalog.md5(p_operation_id::text || ':' || v.id::text)::uuid);
  end loop;
  insert into app_private.contract_day_moves values (p_operation_id, p_tenant_id, auth.uid(), request_data);
end;
$$;
revoke all on function public.replan_contract_day(uuid, uuid, date, jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.replan_contract_day(uuid, uuid, date, jsonb, integer, uuid) to authenticated;
