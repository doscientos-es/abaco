-- Reuse the configured pool parameters and immutable readings; do not expose
-- a coworker's reports or turn free-text activities into measurements.
create function app_private.visit_measurement_context(p_tenant_id uuid, p_visit_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  target public.service_visits%rowtype;
  actor uuid := (select auth.uid());
begin
  if actor is null or not (
    coalesce(public.has_role(p_tenant_id, array['owner','admin','editor','viewer']::public.app_role[]), false)
    or coalesce(public.can_access_assigned_visit(p_tenant_id, p_visit_id), false)
  ) then
    raise exception 'Sin permiso para consultar estas mediciones' using errcode = '42501';
  end if;
  select * into target from public.service_visits v
    where v.id = p_visit_id and v.tenant_id = p_tenant_id;
  if not found then
    raise exception 'Visita no disponible' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.service_assets a
    where a.id = target.asset_id and a.tenant_id = target.tenant_id and a.kind = 'pool') then
    return jsonb_build_object('supported', false, 'parameters', '[]'::jsonb, 'readings', '[]'::jsonb);
  end if;
  return jsonb_build_object('supported', true, 'parameters', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'label', p.label, 'unit', p.unit,
      'version', p.updated_at) order by p.is_core desc, p.code, p.id)
    from public.pool_measurement_parameters p
    where p.tenant_id = target.tenant_id and p.asset_id = target.asset_id and p.active
  ), '[]'::jsonb), 'readings', coalesce((
    select jsonb_agg(to_jsonb(r) order by r.measured_at desc, r.id desc)
    from (
      select current_reading.id, current_reading.label_snapshot as label,
        current_reading.value, current_reading.unit_snapshot as unit, current_reading.method,
        current_reading.measured_at, (
          select jsonb_build_object('value', older.value, 'unit', older.unit_snapshot, 'measured_at', older.measured_at)
          from public.service_visit_measurements older
          join public.service_visits old_visit on old_visit.id = older.visit_id and old_visit.tenant_id = older.tenant_id
          where older.tenant_id = current_reading.tenant_id and older.asset_id = current_reading.asset_id
            and older.parameter_id = current_reading.parameter_id and older.visit_id <> current_reading.visit_id
            and old_visit.status = 'completed'
            and old_visit.actual_end_at <= current_reading.measured_at
            and older.measured_at < current_reading.measured_at
            and older.unit_snapshot = current_reading.unit_snapshot
            and older.method = current_reading.method
            and not exists (select 1 from public.service_visit_measurements correction
              where correction.supersedes_id = older.id)
          order by older.measured_at desc, older.recorded_at desc, older.id desc limit 1
        ) as previous
      from public.service_visit_measurements current_reading
      where current_reading.tenant_id = p_tenant_id and current_reading.visit_id = target.id
        and current_reading.asset_id = target.asset_id
        and not exists (select 1 from public.service_visit_measurements correction
          where correction.supersedes_id = current_reading.id)
      order by current_reading.measured_at desc, current_reading.id desc limit 30
    ) r
  ), '[]'::jsonb));
end;
$$;

-- A UI that presented one unit must never silently write the same number as a
-- different unit if the parameter configuration changed while the form was open.
create function app_private.record_visit_measurement_with_unit(
  p_tenant_id uuid, p_visit_id uuid, p_parameter_id uuid, p_expected_unit text,
  p_parameter_version timestamptz, p_value numeric, p_method text,
  p_measured_at timestamptz, p_operation_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target public.service_visits%rowtype;
  parameter public.pool_measurement_parameters%rowtype;
  prior public.service_visit_measurements%rowtype;
  actor uuid := (select auth.uid());
begin
  if actor is null or not (
    coalesce(public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[]), false)
    or coalesce(public.can_access_assigned_visit(p_tenant_id, p_visit_id), false)
  ) then
    raise exception 'Sin permiso para registrar esta medición' using errcode = '42501';
  end if;
  if p_parameter_id is null or p_operation_id is null or p_parameter_version is null
    or p_expected_unit is null or p_value is null or p_value <> trunc(p_value, 3) then
    raise exception 'Revisa la unidad y usa hasta tres decimales' using errcode = '22023';
  end if;
  select * into target from public.service_visits v
    where v.id = p_visit_id and v.tenant_id = p_tenant_id for update;
  if not found or not (
    coalesce(public.has_role(p_tenant_id, array['owner','admin','editor']::public.app_role[]), false)
    or coalesce(public.can_access_assigned_visit(p_tenant_id, p_visit_id), false)
  ) then
    raise exception 'Visita no disponible' using errcode = '42501';
  end if;
  select * into prior from public.service_visit_measurements m
    where m.operation_id = p_operation_id;
  if found then
    if prior.tenant_id is distinct from p_tenant_id or prior.visit_id is distinct from p_visit_id
      or prior.parameter_id is distinct from p_parameter_id or prior.recorded_by <> actor
      or prior.unit_snapshot is distinct from p_expected_unit then
      raise exception 'La operación ya no coincide con la medición' using errcode = 'P0409';
    end if;
  else
    select * into parameter from public.pool_measurement_parameters p
      where p.id = p_parameter_id and p.asset_id = target.asset_id
        and p.tenant_id = p_tenant_id and p.active for share;
    if not found or parameter.updated_at is distinct from p_parameter_version
      or parameter.unit is distinct from p_expected_unit then
      raise exception 'Cambió el parámetro o su unidad. Actualiza y revisa el valor antes de guardar.' using errcode = 'P0409';
    end if;
  end if;
  return public.record_service_visit_measurement(
    p_tenant_id, p_visit_id, p_parameter_id, p_value, p_method, '',
    p_measured_at, null, p_operation_id
  );
end;
$$;

create function public.visit_measurement_context(p_tenant_id uuid, p_visit_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
begin atomic select app_private.visit_measurement_context(p_tenant_id, p_visit_id); end;
create function public.record_visit_measurement_with_unit(
  p_tenant_id uuid, p_visit_id uuid, p_parameter_id uuid, p_expected_unit text,
  p_parameter_version timestamptz, p_value numeric, p_method text,
  p_measured_at timestamptz, p_operation_id uuid
) returns uuid language sql security invoker set search_path = ''
begin atomic
  select app_private.record_visit_measurement_with_unit(
    p_tenant_id, p_visit_id, p_parameter_id, p_expected_unit, p_parameter_version,
    p_value, p_method, p_measured_at, p_operation_id
  );
end;

do $$
declare scope text;
  signature text;
begin
  foreach scope in array array['public', 'app_private'] loop
    foreach signature in array array[
      'visit_measurement_context(uuid,uuid)',
      'record_visit_measurement_with_unit(uuid,uuid,uuid,text,timestamptz,numeric,text,timestamptz,uuid)'
    ] loop
      execute format('revoke all on function %I.%s from public, anon, authenticated, service_role', scope, signature);
      execute format('grant execute on function %I.%s to authenticated', scope, signature);
    end loop;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
