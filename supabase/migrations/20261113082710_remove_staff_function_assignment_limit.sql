-- Allow a person to have any number of valid functions from their company.
create or replace function public.save_staff_schedule(
  p_tenant_id uuid, p_user_id uuid, p_expected_updated_at timestamptz,
  p_slots jsonb, p_function_ids uuid[]
) returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  current_version timestamptz;
  next_version timestamptz := clock_timestamp();
  slot jsonb;
  matched integer;
begin
  if (select auth.uid()) is null or not public.has_role(p_tenant_id, array['admin']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para gestionar horarios' using errcode = '42501';
  end if;
  if p_user_id is null or not exists (select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = p_user_id)
     or p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) > 56
     or p_function_ids is null or array_position(p_function_ids, null) is not null then
    raise exception 'Horario o funciones inválidos' using errcode = '22023';
  end if;
  for slot in select value from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(slot) <> 'object' or coalesce(slot->>'weekday', '') !~ '^[1-7]$'
       or coalesce(slot->>'start', '') !~ '^(0|[1-9][0-9]{0,3})$'
       or coalesce(slot->>'end', '') !~ '^(0|[1-9][0-9]{0,3})$' then
      raise exception 'Franja horaria inválida' using errcode = '22023';
    end if;
    if (slot->>'start')::integer >= (slot->>'end')::integer or (slot->>'end')::integer > 1440 then
      raise exception 'Franja horaria inválida' using errcode = '22023';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_slots) with ordinality a(slot, n)
    join jsonb_array_elements(p_slots) with ordinality b(slot, n)
      on a.n < b.n and a.slot->>'weekday' = b.slot->>'weekday'
      and (a.slot->>'start')::integer < (b.slot->>'end')::integer
      and (b.slot->>'start')::integer < (a.slot->>'end')::integer) then
    raise exception 'Las franjas no pueden solaparse' using errcode = '22023';
  end if;
  select count(*) into matched from public.staff_functions f where f.tenant_id = p_tenant_id and f.id = any(p_function_ids);
  if matched <> cardinality(p_function_ids) then
    raise exception 'Selecciona funciones válidas de esta empresa' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_user_id::text, 0));
  select updated_at into current_version from public.staff_schedules where tenant_id = p_tenant_id and user_id = p_user_id for update;
  if current_version is distinct from p_expected_updated_at then
    raise exception 'El horario cambió; recarga antes de guardar' using errcode = 'P0409';
  end if;
  insert into public.staff_schedules (tenant_id, user_id, slots, updated_at)
    values (p_tenant_id, p_user_id, p_slots, next_version)
    on conflict (tenant_id, user_id) do update set slots = excluded.slots, updated_at = excluded.updated_at;
  delete from public.staff_function_assignments where tenant_id = p_tenant_id and user_id = p_user_id;
  insert into public.staff_function_assignments (tenant_id, user_id, function_id)
    select p_tenant_id, p_user_id, f from unnest(p_function_ids) as f;
  return next_version;
end;
$$;