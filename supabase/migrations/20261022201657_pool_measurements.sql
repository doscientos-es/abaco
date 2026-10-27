-- M15: operational measurement definitions belong to one pool. An absent range
-- means no assessment; these settings do not claim regulatory certification.
create table public.pool_measurement_parameters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asset_id uuid not null,
  code text not null check (code ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(label) between 1 and 100),
  unit text not null check (char_length(unit) between 1 and 24),
  min_value numeric(12, 3),
  max_value numeric(12, 3),
  is_core boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, asset_id),
  unique (tenant_id, asset_id, code),
  foreign key (asset_id, tenant_id)
    references public.pool_profiles (asset_id, tenant_id) on delete restrict,
  check (
    (min_value is null and max_value is null)
    or (min_value is not null and max_value is not null and min_value < max_value)
  ),
  check (not is_core or code in ('ph', 'disinfectant', 'temperature')),
  check (not is_core or active)
);
create index pool_measurement_parameters_asset_idx
  on public.pool_measurement_parameters (tenant_id, asset_id, active);
create trigger pool_measurement_parameters_touch
  before update on public.pool_measurement_parameters
  for each row execute function public.touch_updated_at();

create function public.seed_pool_measurement_parameters() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.pool_measurement_parameters
    (tenant_id, asset_id, code, label, unit, is_core)
  values
    (new.tenant_id, new.asset_id, 'ph', 'pH', 'pH', true),
    (new.tenant_id, new.asset_id, 'disinfectant', 'Desinfectante libre', 'mg/L', true),
    (new.tenant_id, new.asset_id, 'temperature', 'Temperatura', '°C', true)
  on conflict (tenant_id, asset_id, code) do nothing;
  return new;
end;
$$;
create trigger pool_profiles_seed_measurement_parameters
  after insert on public.pool_profiles
  for each row execute function public.seed_pool_measurement_parameters();
insert into public.pool_measurement_parameters
  (tenant_id, asset_id, code, label, unit, is_core)
select p.tenant_id, p.asset_id, definitions.code, definitions.label,
  definitions.unit, true
from public.pool_profiles p
cross join (values
  ('ph', 'pH', 'pH'),
  ('disinfectant', 'Desinfectante libre', 'mg/L'),
  ('temperature', 'Temperatura', '°C')
) definitions(code, label, unit)
on conflict (tenant_id, asset_id, code) do nothing;
revoke all on function public.seed_pool_measurement_parameters()
  from public, anon, authenticated;

create table public.pool_measurement_parameter_events (
  operation_id uuid primary key,
  tenant_id uuid not null,
  asset_id uuid not null,
  parameter_id uuid not null,
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  before_state jsonb,
  after_state jsonb not null check (jsonb_typeof(after_state) = 'object'),
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  foreign key (parameter_id, tenant_id, asset_id)
    references public.pool_measurement_parameters (id, tenant_id, asset_id)
    on delete restrict
);
create index pool_measurement_parameter_events_asset_idx
  on public.pool_measurement_parameter_events (tenant_id, asset_id, occurred_at desc);
create trigger pool_measurement_parameter_events_immutable
  before update or delete on public.pool_measurement_parameter_events
  for each row execute function public.reject_work_history_change();

alter table public.pool_measurement_parameters enable row level security;
alter table public.pool_measurement_parameter_events enable row level security;
revoke all on public.pool_measurement_parameters,
  public.pool_measurement_parameter_events from public, anon, authenticated;
grant select on public.pool_measurement_parameters,
  public.pool_measurement_parameter_events to authenticated, service_role;
create policy pool_measurement_parameters_select
  on public.pool_measurement_parameters for select to authenticated
  using (public.has_role(tenant_id,
    array['owner', 'admin', 'editor', 'viewer']::public.app_role[]));
create policy pool_measurement_parameter_events_select
  on public.pool_measurement_parameter_events for select to authenticated
  using (public.has_role(tenant_id,
    array['owner', 'admin', 'editor']::public.app_role[]));

create function public.configure_pool_measurement_parameter(
  p_tenant_id uuid, p_asset_id uuid, p_code text,
  p_label text, p_unit text, p_min_value numeric, p_max_value numeric,
  p_active boolean, p_expected_updated_at timestamptz, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  clean_code text := pg_catalog.lower(pg_catalog.btrim(p_code));
  clean_label text := pg_catalog.btrim(p_label);
  clean_unit text := pg_catalog.btrim(p_unit);
  requested jsonb;
  prior public.pool_measurement_parameter_events%rowtype;
  target public.pool_measurement_parameters%rowtype;
  before_snapshot jsonb;
  configured_id uuid;
  core boolean;
begin
  core := clean_code in ('ph', 'disinfectant', 'temperature');
  if p_tenant_id is null or p_asset_id is null or p_operation_id is null
     or clean_code is null or clean_code !~ '^[a-z][a-z0-9_]{0,39}$'
     or clean_label is null or char_length(clean_label) not between 1 and 100
     or clean_unit is null or char_length(clean_unit) not between 1 and 24
     or p_active is null or (core and not p_active)
     or ((p_min_value is null) <> (p_max_value is null))
     or (p_min_value is not null and p_min_value >= p_max_value)
     or p_min_value < -100000 or p_max_value > 100000 then
    raise exception 'Configuración de medición inválida' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
    array['owner', 'admin', 'editor']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para configurar mediciones'
      using errcode = '42501';
  end if;
  requested := pg_catalog.jsonb_build_object(
    'code', clean_code, 'label', clean_label, 'unit', clean_unit,
    'min', p_min_value, 'max', p_max_value, 'active', p_active,
    'expected_updated_at', p_expected_updated_at
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );
  select * into prior from public.pool_measurement_parameter_events
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.asset_id <> p_asset_id
       or prior.request <> requested then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.parameter_id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede configurar mediciones'
      using errcode = 'P0402';
  end if;
  perform 1 from public.pool_profiles p
  where p.asset_id = p_asset_id and p.tenant_id = p_tenant_id for update;
  if not found then raise exception 'Piscina no encontrada' using errcode = 'P0002'; end if;
  select * into target from public.pool_measurement_parameters
  where tenant_id = p_tenant_id and asset_id = p_asset_id and code = clean_code
  for update;
  if found then
    if p_expected_updated_at is null or target.updated_at <> p_expected_updated_at then
      raise exception 'El parámetro cambió en otra sesión; recarga la ficha'
        using errcode = 'P0409';
    end if;
    before_snapshot := pg_catalog.to_jsonb(target) - 'updated_at';
    update public.pool_measurement_parameters
    set label = clean_label, unit = clean_unit,
      min_value = p_min_value, max_value = p_max_value, active = p_active
    where id = target.id returning id into configured_id;
  else
    if p_expected_updated_at is not null or core then
      raise exception 'El parámetro cambió en otra sesión; recarga la ficha'
        using errcode = 'P0409';
    end if;
    insert into public.pool_measurement_parameters
      (tenant_id, asset_id, code, label, unit,
       min_value, max_value, is_core, active)
    values (p_tenant_id, p_asset_id, clean_code, clean_label, clean_unit,
      p_min_value, p_max_value, false, p_active)
    returning id into configured_id;
  end if;
  insert into public.pool_measurement_parameter_events (
    operation_id, tenant_id, asset_id, parameter_id,
    request, before_state, after_state, actor_id
  ) values (
    p_operation_id, p_tenant_id, p_asset_id, configured_id,
    requested, before_snapshot,
    (select pg_catalog.to_jsonb(p) - 'updated_at'
     from public.pool_measurement_parameters p where p.id = configured_id),
    (select auth.uid())
  );
  return configured_id;
end;
$$;
revoke all on function public.configure_pool_measurement_parameter(
  uuid, uuid, text, text, text, numeric, numeric, boolean, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.configure_pool_measurement_parameter(
  uuid, uuid, text, text, text, numeric, numeric, boolean, timestamptz, uuid
) to authenticated;

-- Every reading snapshots its unit and configured range. Corrections append a new
-- reading that points at the old one; originals and the accepted assessment stay.
alter table public.service_visits
  add constraint service_visits_id_tenant_asset_unique
  unique (id, tenant_id, asset_id);
create table public.service_visit_measurements (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  tenant_id uuid not null,
  visit_id uuid not null,
  asset_id uuid not null,
  parameter_id uuid not null,
  value numeric(12, 3) not null check (value between -100000 and 100000),
  code_snapshot text not null,
  label_snapshot text not null,
  unit_snapshot text not null,
  min_snapshot numeric(12, 3),
  max_snapshot numeric(12, 3),
  assessment text not null
    check (assessment in ('below', 'within', 'above', 'unconfigured')),
  method text not null check (char_length(method) between 2 and 100),
  device text not null default '' check (char_length(device) <= 160),
  measured_at timestamptz not null,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  supersedes_id uuid,
  unique (id, tenant_id, visit_id),
  foreign key (visit_id, tenant_id, asset_id)
    references public.service_visits (id, tenant_id, asset_id) on delete restrict,
  foreign key (parameter_id, tenant_id, asset_id)
    references public.pool_measurement_parameters (id, tenant_id, asset_id)
    on delete restrict,
  foreign key (supersedes_id, tenant_id, visit_id)
    references public.service_visit_measurements (id, tenant_id, visit_id)
    on delete restrict
);
create unique index service_visit_measurements_one_successor_idx
  on public.service_visit_measurements (supersedes_id)
  where supersedes_id is not null;
create index service_visit_measurements_visit_idx
  on public.service_visit_measurements (tenant_id, visit_id, measured_at desc);
create index service_visit_measurements_asset_idx
  on public.service_visit_measurements (tenant_id, asset_id, measured_at desc);
create trigger service_visit_measurements_immutable
  before update or delete on public.service_visit_measurements
  for each row execute function public.reject_work_history_change();
alter table public.service_visit_measurements enable row level security;
revoke all on public.service_visit_measurements from public, anon, authenticated;
grant select on public.service_visit_measurements to authenticated, service_role;
create policy service_visit_measurements_select
  on public.service_visit_measurements for select to authenticated using (
    public.has_role(tenant_id,
      array['owner', 'admin', 'editor', 'viewer']::public.app_role[])
    or exists (
      select 1 from public.service_visits v
      where v.id = service_visit_measurements.visit_id
        and v.tenant_id = service_visit_measurements.tenant_id
        and v.assigned_user_id = (select auth.uid())
        and public.has_role(service_visit_measurements.tenant_id,
          array['technician']::public.app_role[])
    )
  );

create function public.visit_measurement_parameters(
  p_tenant_id uuid, p_visit_id uuid
) returns table (
  asset_id uuid, asset_name text, parameter_id uuid,
  code text, label text, unit text,
  min_value numeric, max_value numeric, parameter_updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare target public.service_visits%rowtype;
begin
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
    array['owner', 'admin', 'editor', 'viewer', 'technician']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para consultar mediciones'
      using errcode = '42501';
  end if;
  select * into target from public.service_visits
  where id = p_visit_id and tenant_id = p_tenant_id;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
  if not (public.has_role(p_tenant_id,
      array['owner', 'admin', 'editor', 'viewer']::public.app_role[])
    or (target.assigned_user_id = (select auth.uid())
      and public.has_role(p_tenant_id, array['technician']::public.app_role[]))) then
    raise exception 'No tienes permiso para consultar mediciones'
      using errcode = '42501';
  end if;
  return query
  select a.id, a.name, p.id, p.code, p.label, p.unit,
    p.min_value, p.max_value, p.updated_at
  from public.service_assets a
  join public.pool_measurement_parameters p
    on p.asset_id = a.id and p.tenant_id = a.tenant_id
  where a.id = target.asset_id and a.tenant_id = p_tenant_id
    and a.kind = 'pool' and p.active
  order by p.is_core desc, p.code;
end;
$$;
revoke all on function public.visit_measurement_parameters(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.visit_measurement_parameters(uuid, uuid)
  to authenticated;

create function public.record_service_visit_measurement(
  p_tenant_id uuid, p_visit_id uuid, p_parameter_id uuid,
  p_value numeric, p_method text, p_device text,
  p_measured_at timestamptz, p_supersedes_id uuid, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_visits%rowtype;
  parameter public.pool_measurement_parameters%rowtype;
  prior public.service_visit_measurements%rowtype;
  superseded public.service_visit_measurements%rowtype;
  clean_method text := pg_catalog.btrim(p_method);
  clean_device text := pg_catalog.btrim(coalesce(p_device, ''));
  outcome text;
  created_id uuid;
begin
  if p_tenant_id is null or p_visit_id is null or p_parameter_id is null
     or p_operation_id is null or p_value is null
     or p_value not between -100000 and 100000
     or clean_method is null or char_length(clean_method) not between 2 and 100
     or char_length(clean_device) > 160 or p_measured_at is null
     or p_measured_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'Datos de medición inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
    array['owner', 'admin', 'editor', 'technician']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para registrar mediciones'
      using errcode = '42501';
  end if;
  select * into target from public.service_visits
  where id = p_visit_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
  if not (public.has_role(p_tenant_id,
      array['owner', 'admin', 'editor']::public.app_role[])
    or (target.assigned_user_id = (select auth.uid()) and
      public.has_role(p_tenant_id, array['technician']::public.app_role[]))) then
    raise exception 'No tienes permiso para registrar mediciones'
      using errcode = '42501';
  end if;
  select * into prior from public.service_visit_measurements
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.visit_id <> p_visit_id
       or prior.parameter_id <> p_parameter_id or prior.value <> p_value
       or prior.method <> clean_method or prior.device <> clean_device
       or prior.measured_at <> p_measured_at
       or prior.supersedes_id is distinct from p_supersedes_id then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede registrar mediciones'
      using errcode = 'P0402';
  end if;
  if target.status not in ('scheduled', 'in_progress') then
    raise exception 'La visita cerrada no admite nuevas mediciones'
      using errcode = 'P0409';
  end if;
  if target.asset_id is null then
    raise exception 'Asigna una piscina a la visita antes de medir'
      using errcode = 'P0409';
  end if;
  select * into parameter from public.pool_measurement_parameters
  where id = p_parameter_id and tenant_id = p_tenant_id
    and asset_id = target.asset_id and active;
  if not found then raise exception 'Parámetro no disponible' using errcode = 'P0409'; end if;
  if (parameter.code = 'ph' and (p_value < 0 or p_value > 14))
     or (parameter.code = 'disinfectant' and (p_value < 0 or p_value > 100))
     or (parameter.code = 'temperature' and (p_value < -20 or p_value > 80)) then
    raise exception 'Valor fuera del rango físico admitido para este parámetro'
      using errcode = '22023';
  end if;
  if p_supersedes_id is not null then
    select * into superseded from public.service_visit_measurements
    where id = p_supersedes_id and tenant_id = p_tenant_id
      and visit_id = p_visit_id and parameter_id = p_parameter_id;
    if not found then raise exception 'Lectura original no encontrada'
      using errcode = 'P0002'; end if;
    if exists (select 1 from public.service_visit_measurements m
      where m.supersedes_id = p_supersedes_id) then
      raise exception 'Esta lectura ya tiene una corrección'
        using errcode = 'P0409';
    end if;
  end if;
  outcome := case
    when parameter.min_value is null then 'unconfigured'
    when p_value < parameter.min_value then 'below'
    when p_value > parameter.max_value then 'above'
    else 'within'
  end;
  insert into public.service_visit_measurements (
    operation_id, tenant_id, visit_id, asset_id, parameter_id,
    value, code_snapshot, label_snapshot, unit_snapshot,
    min_snapshot, max_snapshot, assessment, method, device,
    measured_at, recorded_by, supersedes_id
  ) values (
    p_operation_id, p_tenant_id, p_visit_id, target.asset_id, p_parameter_id,
    p_value, parameter.code, parameter.label, parameter.unit,
    parameter.min_value, parameter.max_value, outcome,
    clean_method, clean_device, p_measured_at, (select auth.uid()),
    p_supersedes_id
  ) returning id into created_id;
  return created_id;
end;
$$;
revoke all on function public.record_service_visit_measurement(
  uuid, uuid, uuid, numeric, text, text, timestamptz, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.record_service_visit_measurement(
  uuid, uuid, uuid, numeric, text, text, timestamptz, uuid, uuid
) to authenticated;
