-- Company-specific functions and weekly working schedules.
create table public.staff_functions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  unique (tenant_id, id)
);
create unique index staff_functions_tenant_name on public.staff_functions (tenant_id, lower(name));

create table public.staff_schedules (
  tenant_id uuid not null,
  user_id uuid not null,
  slots jsonb not null default '[]'::jsonb check (jsonb_typeof(slots) = 'array'),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, user_id),
  foreign key (tenant_id, user_id) references public.memberships(tenant_id, user_id) on delete cascade
);

create table public.staff_function_assignments (
  tenant_id uuid not null,
  user_id uuid not null,
  function_id uuid not null,
  primary key (tenant_id, user_id, function_id),
  foreign key (tenant_id, user_id) references public.memberships(tenant_id, user_id) on delete cascade,
  foreign key (tenant_id, function_id) references public.staff_functions(tenant_id, id) on delete restrict
);

alter table public.staff_functions enable row level security;
alter table public.staff_schedules enable row level security;
alter table public.staff_function_assignments enable row level security;
revoke all on public.staff_functions, public.staff_schedules, public.staff_function_assignments from public, anon, authenticated;
grant select, insert, delete on public.staff_functions to authenticated;
grant update (name) on public.staff_functions to authenticated;
grant select on public.staff_schedules, public.staff_function_assignments to authenticated;

create policy staff_assignment_read on public.staff_function_assignments for select to authenticated using (
  public.has_role(tenant_id, array['admin']::public.app_role[])
  or (user_id = (select auth.uid()) and public.is_member(tenant_id))
);
create policy staff_schedule_read on public.staff_schedules for select to authenticated using (
  public.has_role(tenant_id, array['admin']::public.app_role[])
  or (user_id = (select auth.uid()) and public.is_member(tenant_id))
);
create policy staff_function_read on public.staff_functions for select to authenticated using (
  public.has_role(tenant_id, array['admin']::public.app_role[])
  or exists (select 1 from public.staff_function_assignments a where a.tenant_id = staff_functions.tenant_id
    and a.function_id = staff_functions.id and a.user_id = (select auth.uid()))
);
create policy staff_function_insert on public.staff_functions for insert to authenticated with check (
  public.has_role(tenant_id, array['admin']::public.app_role[]) and public.tenant_can_write(tenant_id)
);
create policy staff_function_update on public.staff_functions for update to authenticated using (
  public.has_role(tenant_id, array['admin']::public.app_role[]) and public.tenant_can_write(tenant_id)
) with check (public.has_role(tenant_id, array['admin']::public.app_role[]) and public.tenant_can_write(tenant_id));
create policy staff_function_delete on public.staff_functions for delete to authenticated using (
  public.has_role(tenant_id, array['admin']::public.app_role[]) and public.tenant_can_write(tenant_id)
);

-- Save shifts and assignments together. A stale editor cannot overwrite another administrator.
create function public.save_staff_schedule(
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
     or p_function_ids is null or cardinality(p_function_ids) > 100 or array_position(p_function_ids, null) is not null then
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
revoke all on function public.save_staff_schedule(uuid, uuid, timestamptz, jsonb, uuid[]) from public, anon;
grant execute on function public.save_staff_schedule(uuid, uuid, timestamptz, jsonb, uuid[]) to authenticated;