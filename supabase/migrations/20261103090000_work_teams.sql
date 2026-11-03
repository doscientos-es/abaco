-- Operational groups reuse real tenant memberships. They do not grant access to work or visits.
create table public.work_teams (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create unique index work_teams_active_name_idx on public.work_teams (tenant_id, lower(btrim(name)))
  where archived_at is null;
create trigger work_teams_touch before update on public.work_teams
  for each row execute function public.touch_updated_at();

create table public.work_team_members (
  tenant_id uuid not null,
  team_id uuid not null,
  user_id uuid not null,
  primary key (team_id, user_id),
  foreign key (team_id, tenant_id) references public.work_teams(id, tenant_id) on delete cascade,
  foreign key (tenant_id, user_id) references public.memberships(tenant_id, user_id) on delete cascade
);
create index work_team_members_user_idx on public.work_team_members(tenant_id, user_id);

-- Removing a tenant membership also changes the team's version, preventing stale forms
-- from silently restoring a previous composition.
create function public.touch_work_team_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.work_teams set updated_at = clock_timestamp()
    where id = coalesce(new.team_id, old.team_id);
  return coalesce(new, old);
end;
$$;
create trigger work_team_members_touch after insert or delete on public.work_team_members
  for each row execute function public.touch_work_team_membership();
revoke all on function public.touch_work_team_membership() from public, anon, authenticated;

create table public.work_team_operations (
  operation_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  team_id uuid not null,
  payload jsonb not null,
  actor_id uuid references auth.users(id) on delete set null,
  result_version timestamptz,
  created_at timestamptz not null default now()
);
alter table public.work_teams enable row level security;
alter table public.work_team_members enable row level security;
alter table public.work_team_operations enable row level security;
revoke all on public.work_teams, public.work_team_members, public.work_team_operations
  from public, anon, authenticated;
grant select on public.work_teams, public.work_team_members to authenticated, service_role;
create policy work_teams_select on public.work_teams for select to authenticated using (
  public.has_role(tenant_id, array['owner', 'admin', 'editor', 'viewer']::public.app_role[])
);
create policy work_team_members_select on public.work_team_members for select to authenticated using (
  public.has_role(tenant_id, array['owner', 'admin', 'editor', 'viewer']::public.app_role[])
);

create function public.save_work_team(
  p_tenant_id uuid, p_team_id uuid, p_expected_updated_at timestamptz,
  p_name text, p_description text, p_member_ids uuid[], p_archived boolean, p_operation_id uuid
) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  target public.work_teams%rowtype;
  prior public.work_team_operations%rowtype;
  members uuid[];
  requested jsonb;
  saved_version timestamptz;
  conflict_constraint text;
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para gestionar equipos' using errcode = '42501';
  end if;
  if p_tenant_id is null or p_team_id is null or p_operation_id is null
    or p_name is null or char_length(btrim(p_name)) not between 1 and 80
    or char_length(coalesce(p_description, '')) > 1000 or p_archived is null
    or p_member_ids is null or cardinality(p_member_ids) > 100
    or array_position(p_member_ids, null) is not null then
    raise exception 'Datos del equipo inválidos' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct member_id order by member_id), '{}'::uuid[]) into members
    from unnest(p_member_ids) member_id;
  if not p_archived and cardinality(members) = 0 then
    raise exception 'Selecciona al menos una persona para el equipo' using errcode = '22023';
  end if;
  requested := jsonb_build_object('name', btrim(p_name), 'description', btrim(coalesce(p_description, '')),
    'member_ids', members, 'archived', p_archived);
  -- Serialize retries before checking the optimistic version or current membership.
  insert into public.work_team_operations(operation_id, tenant_id, team_id, payload, actor_id)
    values (p_operation_id, p_tenant_id, p_team_id, requested, (select auth.uid()))
    on conflict (operation_id) do nothing;
  select * into prior from public.work_team_operations where operation_id = p_operation_id for update;
  if prior.tenant_id <> p_tenant_id or prior.team_id <> p_team_id or prior.payload <> requested then
    raise exception 'La clave de operación ya se utilizó con otros datos' using errcode = '23505';
  end if;
  if prior.result_version is not null then return prior.result_version; end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede modificar equipos' using errcode = 'P0402';
  end if;
  select * into target from public.work_teams where id = p_team_id and tenant_id = p_tenant_id for update;
  if found then
    if p_expected_updated_at is null or target.updated_at <> p_expected_updated_at then
      raise exception 'El equipo cambió en otra sesión; vuelve a abrirlo' using errcode = 'P0409';
    end if;
  elsif p_expected_updated_at is not null then
    raise exception 'Equipo no encontrado' using errcode = 'P0002';
  end if;
  -- A shared lock keeps selected memberships stable until the group is saved.
  perform 1 from public.memberships where tenant_id = p_tenant_id and user_id = any(members)
    order by user_id for key share;
  if (select count(*) from public.memberships where tenant_id = p_tenant_id and user_id = any(members))
    <> cardinality(members) then
    raise exception 'Hay personas que ya no pertenecen a la empresa' using errcode = 'P0409';
  end if;
  if target.id is null then
    insert into public.work_teams(id, tenant_id, name, description, archived_at)
      values (p_team_id, p_tenant_id, btrim(p_name), btrim(coalesce(p_description, '')),
        case when p_archived then clock_timestamp() else null end);
  else
    update public.work_teams set name = btrim(p_name), description = btrim(coalesce(p_description, '')),
      archived_at = case when p_archived then coalesce(target.archived_at, clock_timestamp()) else null end
      where id = p_team_id;
  end if;
  delete from public.work_team_members where team_id = p_team_id and not (user_id = any(members));
  insert into public.work_team_members(tenant_id, team_id, user_id)
    select p_tenant_id, p_team_id, member_id from unnest(members) member_id
    on conflict (team_id, user_id) do nothing;
  select updated_at into saved_version from public.work_teams where id = p_team_id;
  update public.work_team_operations set result_version = saved_version
    where operation_id = p_operation_id;
  return saved_version;
exception when unique_violation then
  get stacked diagnostics conflict_constraint = constraint_name;
  if conflict_constraint = 'work_teams_active_name_idx' then
    raise exception 'Ya existe un equipo activo con ese nombre' using errcode = '23505';
  end if;
  raise;
end;
$$;
revoke all on function public.save_work_team(uuid, uuid, timestamptz, text, text, uuid[], boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.save_work_team(uuid, uuid, timestamptz, text, text, uuid[], boolean, uuid)
  to authenticated;

alter table public.work_orders add column work_team_id uuid,
  add constraint work_orders_team_fk foreign key (work_team_id, tenant_id)
    references public.work_teams(id, tenant_id) on delete restrict;
create index work_orders_team_idx on public.work_orders(tenant_id, work_team_id, created_at desc);

-- One command owns the whole plan: dates, responsible person, group and notes are atomic.
create function public.plan_work_order(
  p_tenant_id uuid, p_work_order_id uuid, p_expected_updated_at timestamptz,
  p_responsible_user_id uuid, p_planned_start_at timestamptz,
  p_planned_end_at timestamptz, p_description text, p_operation_id uuid, p_work_team_id uuid
) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  target public.work_orders%rowtype;
  prior public.work_order_events%rowtype;
  selected_team public.work_teams%rowtype;
  requested jsonb;
  result_version timestamptz;
  clean_description text := btrim(coalesce(p_description, ''));
begin
  if p_tenant_id is null or p_work_order_id is null or p_expected_updated_at is null
    or p_operation_id is null or char_length(clean_description) > 4000
    or (p_planned_start_at is not null and p_planned_end_at is not null
      and p_planned_end_at < p_planned_start_at) then
    raise exception 'Datos de planificación inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para planificar trabajos' using errcode = '42501';
  end if;
  requested := jsonb_build_object('responsible_user_id', p_responsible_user_id,
    'planned_start_at', p_planned_start_at, 'planned_end_at', p_planned_end_at,
    'description', clean_description, 'work_team_id', p_work_team_id);
  select * into target from public.work_orders
    where id = p_work_order_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Trabajo no encontrado' using errcode = 'P0002'; end if;
  select * into prior from public.work_order_events where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.work_order_id <> p_work_order_id
      or prior.kind <> 'plan_changed' or not (
        prior.payload->'after' = requested or (
          not ((prior.payload->'after') ? 'work_team_id') and p_work_team_id is null
          and prior.payload->'after' = requested - 'work_team_id'
        )
      ) then
      raise exception 'La clave de operación ya se utilizó con otros datos' using errcode = '23505';
    end if;
    return (prior.payload->>'updated_at')::timestamptz;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede planificar trabajos' using errcode = 'P0402';
  end if;
  if target.updated_at <> p_expected_updated_at then
    raise exception 'El trabajo cambió en otra sesión; recarga la ficha' using errcode = 'P0409';
  end if;
  if target.status in ('completed', 'canceled') then
    raise exception 'No se puede planificar un trabajo cerrado' using errcode = 'P0409';
  end if;
  if p_responsible_user_id is not null and not exists (
    select 1 from public.memberships where tenant_id = p_tenant_id and user_id = p_responsible_user_id
  ) then
    raise exception 'La persona responsable no pertenece a la empresa' using errcode = 'P0409';
  end if;
  if p_work_team_id is not null then
    select * into selected_team from public.work_teams
      where id = p_work_team_id and tenant_id = p_tenant_id for share;
    if not found then raise exception 'Equipo no encontrado' using errcode = 'P0002'; end if;
    if p_work_team_id is distinct from target.work_team_id and (
      selected_team.archived_at is not null or not exists (
        select 1 from public.work_team_members where team_id = p_work_team_id
      )
    ) then
      raise exception 'Elige un equipo activo con al menos una persona' using errcode = 'P0409';
    end if;
  end if;
  update public.work_orders set responsible_user_id = p_responsible_user_id,
    planned_start_at = p_planned_start_at, planned_end_at = p_planned_end_at,
    description = clean_description, work_team_id = p_work_team_id
    where id = target.id returning updated_at into result_version;
  insert into public.work_order_events(operation_id, tenant_id, work_order_id, kind, payload, actor_id)
    values (p_operation_id, p_tenant_id, p_work_order_id, 'plan_changed', jsonb_build_object(
      'before', jsonb_build_object('responsible_user_id', target.responsible_user_id,
        'planned_start_at', target.planned_start_at, 'planned_end_at', target.planned_end_at,
        'description', target.description, 'work_team_id', target.work_team_id),
      'after', requested, 'updated_at', result_version), (select auth.uid()));
  return result_version;
end;
$$;
revoke all on function public.plan_work_order(uuid, uuid, timestamptz, uuid, timestamptz, timestamptz, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.plan_work_order(uuid, uuid, timestamptz, uuid, timestamptz, timestamptz, text, uuid, uuid)
  to authenticated;

-- Older clients keep their assigned group and use exactly the same validation and audit code.
create or replace function public.update_work_order_plan(
  p_tenant_id uuid, p_work_order_id uuid, p_expected_updated_at timestamptz,
  p_responsible_user_id uuid, p_planned_start_at timestamptz,
  p_planned_end_at timestamptz, p_description text, p_operation_id uuid
) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  team_id uuid;
  prior public.work_order_events%rowtype;
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para planificar trabajos' using errcode = '42501';
  end if;
  select work_team_id into team_id from public.work_orders
    where id = p_work_order_id and tenant_id = p_tenant_id for update;
  select * into prior from public.work_order_events where operation_id = p_operation_id;
  if found then team_id := (prior.payload #>> '{after,work_team_id}')::uuid; end if;
  return public.plan_work_order(p_tenant_id, p_work_order_id, p_expected_updated_at,
    p_responsible_user_id, p_planned_start_at, p_planned_end_at,
    p_description, p_operation_id, team_id);
end;
$$;