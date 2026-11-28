-- Generic assets do not get synthetic pool profiles. Preserve all pool foreign keys,
-- parameter ids, policies, immutable readings and prior writer behavior.
create table app_private.generic_measurement_parameters (
  id uuid primary key,
  tenant_id uuid not null,
  asset_id uuid not null,
  label text not null check (label = btrim(label) and char_length(label) between 2 and 100),
  unit text not null check (unit = btrim(unit) and char_length(unit) between 1 and 24),
  method text not null check (method = btrim(method) and char_length(method) between 2 and 100),
  configured_at timestamptz not null default clock_timestamp(),
  configured_by uuid not null,
  unique (id, tenant_id, asset_id),
  foreign key (asset_id, tenant_id) references public.service_assets(id, tenant_id) on delete restrict
);
create unique index generic_measurement_parameters_label_idx
  on app_private.generic_measurement_parameters (tenant_id, asset_id, lower(label));

create table app_private.generic_visit_measurements (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  tenant_id uuid not null,
  visit_id uuid not null,
  asset_id uuid not null,
  parameter_id uuid not null,
  label text not null,
  unit text not null,
  method text not null,
  value numeric(12,3) not null check (value between -100000 and 100000),
  measured_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null,
  unique (tenant_id, operation_id),
  foreign key (visit_id, tenant_id, asset_id)
    references public.service_visits(id, tenant_id, asset_id) on delete restrict,
  foreign key (parameter_id, tenant_id, asset_id)
    references app_private.generic_measurement_parameters(id, tenant_id, asset_id) on delete restrict
);
create index generic_visit_measurements_by_visit
  on app_private.generic_visit_measurements (tenant_id, visit_id, measured_at desc, id desc);
create index generic_visit_measurements_comparable
  on app_private.generic_visit_measurements (tenant_id, asset_id, parameter_id, unit, method,
    measured_at desc, recorded_at desc, id desc);
create trigger generic_visit_measurements_immutable
  before update or delete on app_private.generic_visit_measurements for each row
  execute function public.reject_work_history_change();
alter table app_private.generic_measurement_parameters enable row level security;
alter table app_private.generic_visit_measurements enable row level security;
revoke all on app_private.generic_measurement_parameters, app_private.generic_visit_measurements
  from public, anon, authenticated, service_role;

create function app_private.visit_measurement_facade_context(p_tenant_id uuid, p_visit_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  target public.service_visits%rowtype;
  kind text;
  status text;
  asset_name text;
  writable boolean;
begin
  if (select auth.uid()) is null or not (
    coalesce(public.has_role(p_tenant_id, array['owner','admin','editor','viewer']::public.app_role[]), false)
    or coalesce(public.can_access_assigned_visit(p_tenant_id, p_visit_id), false)
  ) then
    raise exception 'Sin permiso para consultar estas mediciones' using errcode = '42501';
  end if;
  select * into target from public.service_visits v where v.id = p_visit_id and v.tenant_id = p_tenant_id;
  if not found then
    raise exception 'Visita no disponible' using errcode = 'P0002';
  end if;
  select a.kind, a.status, a.name into kind, status, asset_name from public.service_assets a
    where a.tenant_id = p_tenant_id and a.id = target.asset_id;
  if kind is distinct from 'generic' then
    return app_private.visit_measurement_context(p_tenant_id, p_visit_id);
  end if;

  writable := status = 'active' and target.status in ('scheduled','in_progress')
    and coalesce(public.tenant_can_write(p_tenant_id), false);
  return jsonb_build_object('supported', true, 'mode', 'generic', 'asset_name', asset_name, 'can_record', writable
    and (coalesce(public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[]), false)
      or coalesce(public.can_access_assigned_visit(p_tenant_id, p_visit_id), false)),
    'can_configure', writable and coalesce(public.has_role(p_tenant_id,
      array['owner','admin']::public.app_role[]), false),
    'parameters', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'label', p.label, 'unit', p.unit,
        'method', p.method, 'version', p.configured_at) order by lower(p.label), p.id)
      from app_private.generic_measurement_parameters p
      where p.tenant_id = p_tenant_id and p.asset_id = target.asset_id
    ), '[]'::jsonb), 'readings', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.measured_at desc, r.id desc)
      from (
        select m.id, m.label, m.value, m.unit, m.method, m.measured_at, (
          select jsonb_build_object('value', older.value, 'unit', older.unit, 'measured_at', older.measured_at)
          from app_private.generic_visit_measurements older
          join public.service_visits v on v.tenant_id = older.tenant_id and v.id = older.visit_id
          where older.tenant_id = m.tenant_id and older.asset_id = m.asset_id
            and older.parameter_id = m.parameter_id and older.unit = m.unit and older.method = m.method
            and older.visit_id <> m.visit_id and v.status = 'completed'
            and older.measured_at < m.measured_at and v.actual_end_at <= m.measured_at
          order by older.measured_at desc, older.recorded_at desc, older.id desc limit 1
        ) as previous
        from app_private.generic_visit_measurements m
        where m.tenant_id = p_tenant_id and m.visit_id = p_visit_id and m.asset_id = target.asset_id
        order by m.measured_at desc, m.id desc limit 30
      ) r
    ), '[]'::jsonb));
end;
$$;

-- This configuration follows the visit's real asset, never an asset submitted by the
-- browser. No evaluations/thresholds and no new equipment or lifecycle operations.
create function app_private.configure_generic_visit_measurement(
  p_tenant_id uuid, p_visit_id uuid, p_id uuid, p_label text, p_unit text, p_method text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target public.service_visits%rowtype;
  prior app_private.generic_measurement_parameters%rowtype;
  actor uuid := (select auth.uid());
  label text := btrim(p_label);
  unit text := btrim(p_unit);
  method text := btrim(p_method);
begin
  if actor is null or not coalesce(public.has_role(p_tenant_id, array['owner','admin']::public.app_role[]), false) then
    raise exception 'Solo coordinación puede configurar estas mediciones' using errcode = '42501';
  end if;
  if p_id is null or label is null or char_length(label) not between 2 and 100
    or unit is null or char_length(unit) not between 1 and 24
    or method is null or char_length(method) not between 2 and 100 then
    raise exception 'Introduce un nombre, unidad y método válidos' using errcode = '22023';
  end if;
  select * into target from public.service_visits v
    where v.tenant_id = p_tenant_id and v.id = p_visit_id for share;
  if not found then
    raise exception 'Visita no disponible' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 74));
  select * into prior from app_private.generic_measurement_parameters p where p.id = p_id;
  if found then
    if prior.tenant_id is distinct from p_tenant_id or prior.asset_id is distinct from target.asset_id
      or prior.configured_by <> actor or prior.label <> label or prior.unit <> unit or prior.method <> method then
      raise exception 'Esta configuración no coincide con la operación anterior' using errcode = 'P0409';
    end if;
    return prior.id;
  end if;
  if not coalesce(public.tenant_can_write(p_tenant_id), false) then
    raise exception 'La empresa no puede configurar mediciones' using errcode = 'P0402';
  end if;
  perform 1 from public.service_assets a where a.id = target.asset_id and a.tenant_id = p_tenant_id
    and a.kind = 'generic' and a.status = 'active' for share;
  if not found or target.status not in ('scheduled','in_progress') then
    raise exception 'Solo puedes configurar mediciones en una visita abierta de un activo genérico activo'
      using errcode = 'P0409';
  end if;
  insert into app_private.generic_measurement_parameters
    (id,tenant_id,asset_id,label,unit,method,configured_by)
    values (p_id,p_tenant_id,target.asset_id,label,unit,method,actor);
  return p_id;
exception when unique_violation then
  raise exception 'Ya existe un parámetro con este nombre para el activo' using errcode = 'P0409';
end;
$$;

create function app_private.record_visit_measurement_facade(
  p_tenant_id uuid, p_visit_id uuid, p_parameter_id uuid, p_expected_unit text,
  p_parameter_version timestamptz, p_value numeric, p_method text,
  p_measured_at timestamptz, p_operation_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target public.service_visits%rowtype;
  parameter app_private.generic_measurement_parameters%rowtype;
  prior app_private.generic_visit_measurements%rowtype;
  actor uuid := (select auth.uid());
  kind text;
  asset_status text;
  id uuid;
begin
  if actor is null or not (
    coalesce(public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[]), false)
    or coalesce(public.can_access_assigned_visit(p_tenant_id, p_visit_id), false)
  ) then
    raise exception 'Sin permiso para registrar esta medición' using errcode = '42501';
  end if;
  select * into target from public.service_visits v
    where v.tenant_id = p_tenant_id and v.id = p_visit_id for update;
  if not found or not (
    coalesce(public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[]), false)
    or coalesce(public.can_access_assigned_visit(p_tenant_id, p_visit_id), false)
  ) then
    raise exception 'Visita no disponible' using errcode = '42501';
  end if;
  select a.kind, a.status into kind, asset_status from public.service_assets a
    where a.tenant_id = p_tenant_id and a.id = target.asset_id for share;
  if kind is distinct from 'generic' then
    return app_private.record_visit_measurement_with_unit(
      p_tenant_id, p_visit_id, p_parameter_id, p_expected_unit, p_parameter_version,
      p_value, p_method, p_measured_at, p_operation_id
    );
  end if;
  if p_parameter_id is null or p_operation_id is null or p_expected_unit is null or p_parameter_version is null
    or p_method is null or p_measured_at is null or p_measured_at > clock_timestamp() + interval '5 minutes'
    or p_value is null or p_value not between -100000 and 100000 or p_value <> trunc(p_value,3) then
    raise exception 'Revisa la unidad y usa hasta tres decimales' using errcode = '22023';
  end if;
  select * into prior from app_private.generic_visit_measurements m
    where m.tenant_id = p_tenant_id and m.operation_id = p_operation_id;
  if found then
    if prior.visit_id <> p_visit_id or prior.parameter_id <> p_parameter_id or prior.recorded_by <> actor
      or prior.unit <> p_expected_unit or prior.method <> p_method or prior.value <> p_value
      or prior.measured_at <> p_measured_at then
      raise exception 'La operación ya no coincide con la medición' using errcode = 'P0409';
    end if;
    return prior.id;
  end if;
  if not coalesce(public.tenant_can_write(p_tenant_id), false) then
    raise exception 'La empresa no puede registrar mediciones' using errcode = 'P0402';
  end if;
  if asset_status <> 'active' or target.status not in ('scheduled','in_progress') then
    raise exception 'No puedes registrar mediciones en esta visita o activo' using errcode = 'P0409';
  end if;
  select * into parameter from app_private.generic_measurement_parameters p
    where p.id = p_parameter_id and p.tenant_id = p_tenant_id and p.asset_id = target.asset_id for share;
  if not found or parameter.unit <> p_expected_unit or parameter.method <> p_method
    or parameter.configured_at <> p_parameter_version then
    raise exception 'Cambió el parámetro, la unidad o el método. Actualiza y revisa el valor.' using errcode = 'P0409';
  end if;
  insert into app_private.generic_visit_measurements
    (operation_id,tenant_id,visit_id,asset_id,parameter_id,label,unit,method,value,measured_at,recorded_by)
    values (p_operation_id,p_tenant_id,p_visit_id,target.asset_id,p_parameter_id,
      parameter.label,parameter.unit,parameter.method,p_value,p_measured_at,actor)
    returning generic_visit_measurements.id into id;
  return id;
end;
$$;

create or replace function public.visit_measurement_context(p_tenant_id uuid,p_visit_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
begin atomic select app_private.visit_measurement_facade_context(p_tenant_id,p_visit_id); end;
create or replace function public.record_visit_measurement_with_unit(
  p_tenant_id uuid, p_visit_id uuid, p_parameter_id uuid, p_expected_unit text,
  p_parameter_version timestamptz, p_value numeric, p_method text,
  p_measured_at timestamptz, p_operation_id uuid
) returns uuid language sql security invoker set search_path = ''
begin atomic
  select app_private.record_visit_measurement_facade(
    p_tenant_id,p_visit_id,p_parameter_id,p_expected_unit,p_parameter_version,
    p_value,p_method,p_measured_at,p_operation_id
  );
end;
create function public.configure_generic_visit_measurement(
  p_tenant_id uuid,p_visit_id uuid,p_id uuid,p_label text,p_unit text,p_method text
) returns uuid language sql security invoker set search_path = ''
begin atomic
  select app_private.configure_generic_visit_measurement(p_tenant_id,p_visit_id,p_id,p_label,p_unit,p_method);
end;

revoke all on function app_private.visit_measurement_facade_context(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function app_private.record_visit_measurement_facade(uuid,uuid,uuid,text,timestamptz,numeric,text,timestamptz,uuid)
  from public,anon,authenticated,service_role;
revoke all on function app_private.configure_generic_visit_measurement(uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.configure_generic_visit_measurement(uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function app_private.visit_measurement_facade_context(uuid,uuid) to authenticated;
grant execute on function app_private.record_visit_measurement_facade(uuid,uuid,uuid,text,timestamptz,numeric,text,timestamptz,uuid)
  to authenticated;
grant execute on function app_private.configure_generic_visit_measurement(uuid,uuid,uuid,text,text,text) to authenticated;
grant execute on function public.configure_generic_visit_measurement(uuid,uuid,uuid,text,text,text) to authenticated;

notify pgrst, 'reload schema';
