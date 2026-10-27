-- Manual work can start from a client, with an optional service location and asset.
-- The operational links can be corrected later; the creation snapshot remains immutable.
alter table public.work_orders
  add column location_id uuid,
  add column asset_id uuid,
  add column description text not null default '',
  add column responsible_user_id uuid,
  add column planned_start_at timestamptz,
  add column planned_end_at timestamptz,
  add column actual_start_at timestamptz,
  add column actual_end_at timestamptz,
  add constraint work_orders_planned_dates_check
    check (planned_end_at is null or planned_start_at is null
      or planned_end_at >= planned_start_at),
  add constraint work_orders_actual_dates_check
    check (actual_end_at is null or actual_start_at is null
      or actual_end_at >= actual_start_at),
  add constraint work_orders_location_fk foreign key (location_id, tenant_id, client_id)
    references public.service_locations (id, tenant_id, client_id) on delete restrict,
  add constraint work_orders_asset_fk foreign key (asset_id, tenant_id)
    references public.service_assets (id, tenant_id) on delete restrict,
  add constraint work_orders_responsible_fk foreign key (tenant_id, responsible_user_id)
    references public.memberships (tenant_id, user_id) on delete set null (responsible_user_id);
create index work_orders_responsible_idx on public.work_orders
  (tenant_id, responsible_user_id, planned_start_at)
  where responsible_user_id is not null;

create function public.validate_work_order_asset() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.asset_id is not null and (new.location_id is null or not exists (
    select 1 from public.service_assets a
    where a.id = new.asset_id and a.tenant_id = new.tenant_id
      and a.location_id = new.location_id
  )) then
    raise exception 'El activo no pertenece a la ubicación del trabajo'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger work_orders_validate_asset
  before insert or update of asset_id, location_id, tenant_id on public.work_orders
  for each row execute function public.validate_work_order_asset();
revoke execute on function public.validate_work_order_asset()
  from public, anon, authenticated;

create function public.record_work_order_execution_times() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'scheduled' and new.planned_start_at is null then
    raise exception 'Indica el inicio previsto antes de planificar el trabajo'
      using errcode = 'P0409';
  end if;
  if new.status = 'in_progress' and old.status <> 'in_progress'
     and new.actual_start_at is null then
    new.actual_start_at := clock_timestamp();
  end if;
  if new.status in ('completed', 'canceled') and old.status = 'in_progress'
     and new.actual_end_at is null then
    new.actual_end_at := clock_timestamp();
  end if;
  return new;
end;
$$;
create trigger work_orders_record_execution_times
  before update of status on public.work_orders
  for each row execute function public.record_work_order_execution_times();
revoke execute on function public.record_work_order_execution_times()
  from public, anon, authenticated;

create table public.work_creation_operations (
  operation_id uuid primary key,
  tenant_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  work_order_id uuid,
  created_at timestamptz not null default now(),
  foreign key (work_order_id, tenant_id)
    references public.work_orders (id, tenant_id) on delete restrict
);
alter table public.work_creation_operations enable row level security;
revoke all on public.work_creation_operations from public, anon, authenticated;
grant select on public.work_creation_operations to authenticated, service_role;
create policy work_creation_operations_select on public.work_creation_operations
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );

create function public.create_manual_work_order(
  p_tenant_id uuid, p_client_id uuid, p_title text, p_kind text,
  p_location_id uuid, p_asset_id uuid, p_description text, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  prior public.work_creation_operations%rowtype;
  customer public.clients%rowtype;
  place public.service_locations%rowtype;
  asset public.service_assets%rowtype;
  clean_title text := trim(p_title);
  clean_description text := trim(coalesce(p_description, ''));
  payload jsonb;
  created_id uuid;
begin
  if p_tenant_id is null or p_client_id is null or p_operation_id is null
     or clean_title is null or char_length(clean_title) not between 1 and 200
     or p_kind is null or p_kind not in ('installation', 'repair', 'maintenance', 'other')
     or char_length(clean_description) > 4000
     or (p_asset_id is not null and p_location_id is null) then
    raise exception 'Datos del trabajo inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para crear trabajos' using errcode = '42501';
  end if;
  payload := jsonb_build_object(
    'client_id', p_client_id, 'title', clean_title, 'kind', p_kind,
    'location_id', p_location_id, 'asset_id', p_asset_id,
    'description', clean_description
  );
  select * into prior from public.work_creation_operations
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.payload <> payload then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    if prior.work_order_id is not null then return prior.work_order_id; end if;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede crear trabajos' using errcode = 'P0402';
  end if;

  insert into public.work_creation_operations (operation_id, tenant_id, payload)
  values (p_operation_id, p_tenant_id, payload)
  on conflict (operation_id) do nothing;
  select * into prior from public.work_creation_operations
  where operation_id = p_operation_id for update;
  if prior.tenant_id <> p_tenant_id or prior.payload <> payload then
    raise exception 'La clave de operación ya se utilizó con otros datos'
      using errcode = '23505';
  end if;
  if prior.work_order_id is not null then return prior.work_order_id; end if;

  select * into customer from public.clients
  where id = p_client_id and tenant_id = p_tenant_id;
  if not found then raise exception 'Cliente no encontrado' using errcode = 'P0002'; end if;
  if customer.archived_at is not null then
    raise exception 'No se puede crear un trabajo para un cliente archivado'
      using errcode = 'P0409';
  end if;
  if p_location_id is not null then
    select * into place from public.service_locations
    where id = p_location_id and tenant_id = p_tenant_id
      and client_id = p_client_id and active;
    if not found then
      raise exception 'Ubicación de servicio no válida' using errcode = 'P0409';
    end if;
  end if;
  if p_asset_id is not null then
    select * into asset from public.service_assets
    where id = p_asset_id and tenant_id = p_tenant_id
      and location_id = p_location_id and status <> 'retired';
    if not found then raise exception 'Activo no válido' using errcode = 'P0409'; end if;
  end if;

  insert into public.work_orders (
    tenant_id, client_id, location_id, asset_id, title, kind, description,
    source_snapshot, created_by
  ) values (
    p_tenant_id, p_client_id, p_location_id, p_asset_id,
    clean_title, p_kind, clean_description,
    jsonb_build_object(
      'origin_kind', 'manual',
      'client', jsonb_build_object('id', customer.id, 'name', customer.name),
      'location', case when p_location_id is null then null else jsonb_build_object(
        'id', place.id, 'name', place.name, 'address', place.address) end,
      'asset', case when p_asset_id is null then null else jsonb_build_object(
        'id', asset.id, 'name', asset.name, 'kind', asset.kind) end
    ),
    (select auth.uid())
  ) returning id into created_id;
  insert into public.work_order_events (
    operation_id, tenant_id, work_order_id, kind, payload, actor_id
  ) values (
    p_operation_id, p_tenant_id, created_id, 'created',
    jsonb_build_object('origin_kind', 'manual'), (select auth.uid())
  );
  update public.work_creation_operations set work_order_id = created_id
  where operation_id = p_operation_id;
  return created_id;
end;
$$;
revoke all on function public.create_manual_work_order(
  uuid, uuid, text, text, uuid, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_manual_work_order(
  uuid, uuid, text, text, uuid, uuid, text, uuid
) to authenticated;

alter table public.work_order_events drop constraint work_order_events_kind_check;
alter table public.work_order_events add constraint work_order_events_kind_check
  check (kind in ('created', 'status_changed', 'plan_changed'));

create function public.update_work_order_plan(
  p_tenant_id uuid, p_work_order_id uuid, p_expected_updated_at timestamptz,
  p_responsible_user_id uuid, p_planned_start_at timestamptz,
  p_planned_end_at timestamptz, p_description text, p_operation_id uuid
) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  target public.work_orders%rowtype;
  prior public.work_order_events%rowtype;
  requested jsonb;
  result_version timestamptz;
  clean_description text := trim(coalesce(p_description, ''));
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
  requested := jsonb_build_object(
    'responsible_user_id', p_responsible_user_id,
    'planned_start_at', p_planned_start_at,
    'planned_end_at', p_planned_end_at,
    'description', clean_description
  );

  select * into target from public.work_orders
  where id = p_work_order_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Trabajo no encontrado' using errcode = 'P0002'; end if;
  select * into prior from public.work_order_events
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.work_order_id <> p_work_order_id
       or prior.kind <> 'plan_changed' or prior.payload->'after' <> requested then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return (prior.payload->>'updated_at')::timestamptz;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede planificar trabajos' using errcode = 'P0402';
  end if;
  if target.updated_at <> p_expected_updated_at then
    raise exception 'El trabajo cambió en otra sesión; recarga la ficha'
      using errcode = 'P0409';
  end if;
  if target.status in ('completed', 'canceled') then
    raise exception 'No se puede planificar un trabajo cerrado' using errcode = 'P0409';
  end if;
  if p_responsible_user_id is not null and not exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id and m.user_id = p_responsible_user_id
  ) then
    raise exception 'La persona responsable no pertenece a la empresa'
      using errcode = 'P0409';
  end if;

  update public.work_orders set
    responsible_user_id = p_responsible_user_id,
    planned_start_at = p_planned_start_at,
    planned_end_at = p_planned_end_at,
    description = clean_description
  where id = target.id returning updated_at into result_version;
  insert into public.work_order_events (
    operation_id, tenant_id, work_order_id, kind, payload, actor_id
  ) values (
    p_operation_id, p_tenant_id, p_work_order_id, 'plan_changed',
    jsonb_build_object(
      'before', jsonb_build_object(
        'responsible_user_id', target.responsible_user_id,
        'planned_start_at', target.planned_start_at,
        'planned_end_at', target.planned_end_at,
        'description', target.description
      ),
      'after', requested, 'updated_at', result_version
    ),
    (select auth.uid())
  );
  return result_version;
end;
$$;
revoke all on function public.update_work_order_plan(
  uuid, uuid, timestamptz, uuid, timestamptz, timestamptz, text, uuid
) from public, anon, authenticated;
grant execute on function public.update_work_order_plan(
  uuid, uuid, timestamptz, uuid, timestamptz, timestamptz, text, uuid
) to authenticated;
