-- M04-M06: a client can have multiple contacts and service locations. Assets and
-- equipment keep their own history; archiving replaces destructive deletion.
alter table public.clients
  add column kind text not null default 'person'
    check (kind in ('person', 'community', 'business')),
  add column billing_address text not null default '',
  add column tags text[] not null default '{}',
  add column archived_at timestamptz;

-- Existing estimates and installations keep pointing at the same client.
drop policy clients_delete on public.clients;
revoke delete on public.clients from authenticated;

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null,
  name text not null check (char_length(name) between 1 and 160),
  role text not null default 'other'
    check (role in ('primary', 'administrative', 'technical', 'other')),
  email text not null default '',
  phone text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (client_id, tenant_id) references public.clients (id, tenant_id) on delete restrict
);
create index client_contacts_client_idx on public.client_contacts (tenant_id, client_id, active);
create unique index client_contacts_one_primary_idx
  on public.client_contacts (tenant_id, client_id) where role = 'primary' and active;

create table public.service_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null,
  name text not null check (char_length(name) between 1 and 160),
  kind text not null default 'service' check (kind in ('service', 'billing', 'both')),
  address text not null check (char_length(address) between 1 and 500),
  postal_code text not null default '',
  city text not null default '',
  latitude numeric(10, 7) check (latitude between -90 and 90),
  longitude numeric(10, 7) check (longitude between -180 and 180),
  timezone text not null default 'Europe/Madrid',
  opening_hours text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  unique (id, tenant_id, client_id),
  foreign key (client_id, tenant_id) references public.clients (id, tenant_id) on delete restrict
);
create index service_locations_client_idx
  on public.service_locations (tenant_id, client_id, active);

create table public.service_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  location_id uuid not null,
  kind text not null check (kind in ('pool', 'generic')),
  name text not null check (char_length(name) between 1 and 160),
  status text not null default 'active'
    check (status in ('active', 'out_of_season', 'inactive', 'retired')),
  description text not null default '',
  installed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (location_id, tenant_id)
    references public.service_locations (id, tenant_id) on delete restrict
);
create index service_assets_location_idx
  on public.service_assets (tenant_id, location_id, status);

create table public.pool_profiles (
  asset_id uuid primary key,
  tenant_id uuid not null,
  use_kind text not null default 'private'
    check (use_kind in ('private', 'community', 'public', 'other')),
  pool_kind text not null default 'outdoor'
    check (pool_kind in ('outdoor', 'indoor', 'spa', 'other')),
  length_m numeric(8, 2) check (length_m > 0),
  width_m numeric(8, 2) check (width_m > 0),
  average_depth_m numeric(8, 2) check (average_depth_m > 0),
  volume_m3 numeric(10, 2) check (volume_m3 > 0),
  treatment text not null default '',
  lining text not null default '',
  season_notes text not null default '',
  measurement_ranges jsonb not null default '{}'::jsonb
    check (jsonb_typeof(measurement_ranges) = 'object'),
  updated_at timestamptz not null default now(),
  unique (asset_id, tenant_id),
  foreign key (asset_id, tenant_id)
    references public.service_assets (id, tenant_id) on delete restrict
);

create table public.installed_equipment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asset_id uuid not null,
  replaces_equipment_id uuid,
  kind text not null check (char_length(kind) between 1 and 100),
  manufacturer text not null default '',
  model text not null default '',
  serial_number text not null default '',
  specifications text not null default '',
  supplier text not null default '',
  installed_at date,
  warranty_ends_at date,
  status text not null default 'active'
    check (status in ('active', 'replaced', 'transferred', 'retired')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (asset_id, tenant_id)
    references public.service_assets (id, tenant_id) on delete restrict,
  foreign key (replaces_equipment_id, tenant_id)
    references public.installed_equipment (id, tenant_id) on delete restrict
);
create index installed_equipment_asset_idx
  on public.installed_equipment (tenant_id, asset_id, status);
create unique index installed_equipment_one_successor_idx
  on public.installed_equipment (tenant_id, replaces_equipment_id)
  where replaces_equipment_id is not null;
create index installed_equipment_warranty_idx
  on public.installed_equipment (tenant_id, warranty_ends_at)
  where status = 'active' and warranty_ends_at is not null;

create function public.require_active_equipment_asset() returns trigger
language plpgsql set search_path = ''
as $$
declare asset_status text;
declare location_active boolean;
begin
  if new.status <> 'active' then return new; end if;
  select a.status, l.active into asset_status, location_active
  from public.service_assets a
  join public.service_locations l on l.id = a.location_id and l.tenant_id = a.tenant_id
  where a.id = new.asset_id and a.tenant_id = new.tenant_id for share of a, l;
  if (asset_status is distinct from 'active' and asset_status is distinct from 'out_of_season')
     or location_active is distinct from true then
    raise exception 'El equipo requiere un activo en servicio';
  end if;
  return new;
end;
$$;
create trigger installed_equipment_require_asset
  before insert or update of asset_id, status on public.installed_equipment
  for each row execute function public.require_active_equipment_asset();

create function public.protect_equipment_lineage() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.replaces_equipment_id is not null and current_user = 'authenticated' then
      raise exception 'La sustitución debe realizarse con su operación de servidor';
    end if;
  elsif new.replaces_equipment_id is distinct from old.replaces_equipment_id
     or (old.status = 'replaced' and to_jsonb(new) - 'updated_at'
         is distinct from to_jsonb(old) - 'updated_at' and current_user = 'authenticated')
     or (new.status = 'replaced' and old.status <> 'replaced'
         and current_user = 'authenticated') then
    raise exception 'La relación de sustitución no se modifica directamente';
  end if;
  return new;
end;
$$;
create trigger installed_equipment_protect_lineage
  before insert or update on public.installed_equipment
  for each row execute function public.protect_equipment_lineage();

-- Prices and internal acquisition costs are never part of the technical projection.
create table public.installed_equipment_costs (
  equipment_id uuid primary key,
  tenant_id uuid not null,
  cost_cents bigint not null check (cost_cents >= 0),
  updated_at timestamptz not null default now(),
  foreign key (equipment_id, tenant_id)
    references public.installed_equipment (id, tenant_id) on delete restrict
);

create function public.require_pool_asset() returns trigger
language plpgsql set search_path = ''
as $$
declare asset_kind text;
begin
  select kind into asset_kind from public.service_assets
  where id = new.asset_id and tenant_id = new.tenant_id for key share;
  if asset_kind is distinct from 'pool' then
    raise exception 'La ficha de piscina requiere un activo de tipo piscina';
  end if;
  return new;
end;
$$;
create trigger pool_profiles_require_pool before insert or update on public.pool_profiles
  for each row execute function public.require_pool_asset();

create function public.lock_asset_kind() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'El tipo de activo no se puede cambiar';
  end if;
  return new;
end;
$$;
create trigger service_assets_lock_kind before update on public.service_assets
  for each row execute function public.lock_asset_kind();

create function public.prevent_billing_location_with_assets() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.kind = 'billing' and old.kind <> 'billing' and exists (
    select 1 from public.service_assets where location_id = old.id and tenant_id = old.tenant_id
  ) then
    raise exception 'Una ubicación con activos debe ser de servicio';
  end if;
  if new.active = false and old.active = true and exists (
    select 1 from public.service_assets
    where location_id = old.id and tenant_id = old.tenant_id
      and status in ('active', 'out_of_season')
  ) then
    raise exception 'Desactiva los activos antes de dar de baja la ubicación';
  end if;
  return new;
end;
$$;
create trigger service_locations_keep_service_kind before update on public.service_locations
  for each row execute function public.prevent_billing_location_with_assets();

-- A pool and its profile are created together; a failed profile never leaves a bare asset.
create function public.create_pool_asset(
  p_tenant_id uuid, p_location_id uuid, p_name text,
  p_volume_m3 numeric, p_treatment text,
  p_use_kind text default 'private', p_pool_kind text default 'outdoor',
  p_length_m numeric default null, p_width_m numeric default null,
  p_average_depth_m numeric default null, p_lining text default '',
  p_season_notes text default ''
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare created_id uuid;
declare location_kind text;
declare location_active boolean;
begin
  if p_tenant_id is null or p_location_id is null or nullif(trim(p_name), '') is null
     or char_length(p_name) > 160 or (p_volume_m3 is not null and p_volume_m3 <= 0)
     or (p_length_m is not null and p_length_m <= 0)
     or (p_width_m is not null and p_width_m <= 0)
     or (p_average_depth_m is not null and p_average_depth_m <= 0) then
    raise exception 'Datos de piscina inválidos' using errcode = '22023';
  end if;
  select kind, active into location_kind, location_active from public.service_locations
  where id = p_location_id and tenant_id = p_tenant_id for share;
  if location_kind is null or location_kind = 'billing' or location_active is distinct from true then
    raise exception 'La piscina requiere una ubicación de servicio' using errcode = '22023';
  end if;
  insert into public.service_assets (tenant_id, location_id, kind, name)
  values (p_tenant_id, p_location_id, 'pool', trim(p_name)) returning id into created_id;
  insert into public.pool_profiles (
    tenant_id, asset_id, volume_m3, treatment, use_kind, pool_kind,
    length_m, width_m, average_depth_m, lining, season_notes
  ) values (
    p_tenant_id, created_id, p_volume_m3, coalesce(p_treatment, ''),
    p_use_kind, p_pool_kind, p_length_m, p_width_m, p_average_depth_m,
    coalesce(p_lining, ''), coalesce(p_season_notes, '')
  );
  return created_id;
end;
$$;

-- The asset name and its pool measurements form one editable aggregate.
create function public.update_pool_asset(
  p_tenant_id uuid, p_asset_id uuid, p_name text, p_volume_m3 numeric,
  p_treatment text, p_expected_asset_updated_at timestamptz,
  p_expected_profile_updated_at timestamptz,
  p_use_kind text default 'private', p_pool_kind text default 'outdoor',
  p_length_m numeric default null, p_width_m numeric default null,
  p_average_depth_m numeric default null, p_lining text default '',
  p_season_notes text default ''
) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if p_tenant_id is null or p_asset_id is null or nullif(trim(p_name), '') is null
     or char_length(p_name) > 160 or (p_volume_m3 is not null and p_volume_m3 <= 0)
     or (p_length_m is not null and p_length_m <= 0)
     or (p_width_m is not null and p_width_m <= 0)
     or (p_average_depth_m is not null and p_average_depth_m <= 0)
     or p_expected_asset_updated_at is null or p_expected_profile_updated_at is null then
    raise exception 'Datos de piscina inválidos' using errcode = '22023';
  end if;
  update public.service_assets set name = trim(p_name)
  where id = p_asset_id and tenant_id = p_tenant_id and kind = 'pool'
    and status <> 'retired' and updated_at = p_expected_asset_updated_at;
  if not found then
    raise exception 'La piscina cambió en otra sesión; recarga la ficha' using errcode = 'P0409';
  end if;
  update public.pool_profiles set volume_m3 = p_volume_m3,
    treatment = coalesce(p_treatment, ''), use_kind = p_use_kind,
    pool_kind = p_pool_kind, length_m = p_length_m, width_m = p_width_m,
    average_depth_m = p_average_depth_m, lining = coalesce(p_lining, ''),
    season_notes = coalesce(p_season_notes, '')
  where asset_id = p_asset_id and tenant_id = p_tenant_id
    and updated_at = p_expected_profile_updated_at;
  if not found then
    raise exception 'La ficha de piscina cambió en otra sesión; recarga la ficha'
      using errcode = 'P0409';
  end if;
end;
$$;

-- Replacement is one transaction: the former unit remains in the passport and
-- the new unit is installed only if the former version is still current.
create function public.replace_installed_equipment(
  p_tenant_id uuid, p_equipment_id uuid, p_expected_updated_at timestamptz,
  p_kind text, p_manufacturer text, p_model text, p_serial_number text,
  p_warranty_ends_at date, p_supplier text default '',
  p_installed_at date default null, p_specifications text default '',
  p_notes text default ''
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare previous public.installed_equipment%rowtype;
declare new_id uuid;
begin
  if p_tenant_id is null or p_equipment_id is null or p_expected_updated_at is null
     or nullif(trim(p_kind), '') is null or char_length(p_kind) > 100 then
    raise exception 'Datos de sustitución inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin', 'editor')
  ) then
    raise exception 'No tienes permiso para sustituir equipos' using errcode = '42501';
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede modificar equipos' using errcode = 'P0402';
  end if;
  select * into previous from public.installed_equipment
  where id = p_equipment_id and tenant_id = p_tenant_id for update;
  if not found or previous.status <> 'active'
     or previous.updated_at <> p_expected_updated_at then
    raise exception 'El equipo cambió en otra sesión; recarga la ficha' using errcode = 'P0409';
  end if;
  update public.installed_equipment set status = 'replaced' where id = previous.id;
  insert into public.installed_equipment (
    tenant_id, asset_id, replaces_equipment_id, kind, manufacturer, model,
    serial_number, warranty_ends_at, supplier, installed_at, specifications, notes
  ) values (
    p_tenant_id, previous.asset_id, previous.id, trim(p_kind), coalesce(p_manufacturer, ''),
    coalesce(p_model, ''), coalesce(p_serial_number, ''), p_warranty_ends_at,
    coalesce(p_supplier, ''), p_installed_at, coalesce(p_specifications, ''),
    coalesce(p_notes, '')
  ) returning id into new_id;
  return new_id;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'client_contacts', 'service_locations', 'service_assets', 'pool_profiles',
    'installed_equipment', 'installed_equipment_costs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_member(tenant_id))',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_role(tenant_id, array[''owner'',''admin'',''editor'']::public.app_role[]))',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_role(tenant_id, array[''owner'',''admin'',''editor'']::public.app_role[])) with check (public.has_role(tenant_id, array[''owner'',''admin'',''editor'']::public.app_role[]))',
      t || '_update', t
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.lock_tenant_id()',
      t || '_lock_tenant', t
    );
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function public.require_active_plan()',
      t || '_require_plan', t
    );
  end loop;
  foreach t in array array[
    'client_contacts', 'service_locations', 'service_assets', 'pool_profiles',
    'installed_equipment', 'installed_equipment_costs'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      t || '_touch', t
    );
  end loop;
end $$;

drop policy installed_equipment_costs_select on public.installed_equipment_costs;
drop policy installed_equipment_costs_insert on public.installed_equipment_costs;
drop policy installed_equipment_costs_update on public.installed_equipment_costs;
create policy installed_equipment_costs_select on public.installed_equipment_costs
  for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.app_role[]));
create policy installed_equipment_costs_insert on public.installed_equipment_costs
  for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin']::public.app_role[]));
create policy installed_equipment_costs_update on public.installed_equipment_costs
  for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin']::public.app_role[]))
  with check (public.has_role(tenant_id, array['owner','admin']::public.app_role[]));

revoke execute on function public.require_pool_asset() from public, anon, authenticated;
revoke execute on function public.lock_asset_kind() from public, anon, authenticated;
revoke execute on function public.prevent_billing_location_with_assets()
  from public, anon, authenticated;
revoke execute on function public.require_active_equipment_asset()
  from public, anon, authenticated;
revoke execute on function public.protect_equipment_lineage()
  from public, anon, authenticated;
revoke all on function public.create_pool_asset(uuid, uuid, text, numeric, text, text, text, numeric, numeric, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.create_pool_asset(uuid, uuid, text, numeric, text, text, text, numeric, numeric, numeric, text, text)
  to authenticated;
revoke all on function public.update_pool_asset(uuid, uuid, text, numeric, text, timestamptz, timestamptz, text, text, numeric, numeric, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.update_pool_asset(uuid, uuid, text, numeric, text, timestamptz, timestamptz, text, text, numeric, numeric, numeric, text, text)
  to authenticated;
revoke all on function public.replace_installed_equipment(uuid, uuid, timestamptz, text, text, text, text, date, text, date, text, text)
  from public, anon, authenticated;
grant execute on function public.replace_installed_equipment(uuid, uuid, timestamptz, text, text, text, text, date, text, date, text, text)
  to authenticated;
