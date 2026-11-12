-- M17: structured recommendations and next actions in revisable reports.
create or replace function public.save_service_visit_report(
  p_tenant_id uuid, p_visit_id uuid, p_expected_revision bigint,
  p_data jsonb, p_operation_id uuid
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_visits%rowtype;
  report public.service_visit_reports%rowtype;
  prior public.service_visit_report_writes%rowtype;
  item jsonb;
  next_revision bigint;
begin
  if p_tenant_id is null or p_visit_id is null or p_operation_id is null
     or p_expected_revision is null or p_expected_revision < 0
     or p_data is null or pg_catalog.jsonb_typeof(p_data) <> 'object'
     or pg_catalog.octet_length(p_data::text) > 32000
     or not (p_data ? 'notes') or not (p_data ? 'checklist')
     or p_data - 'notes' - 'checklist' - 'recommendations' - 'next_actions'
       <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(p_data->'notes') <> 'string'
     or pg_catalog.char_length(p_data->>'notes') > 4000
     or pg_catalog.jsonb_typeof(p_data->'checklist') <> 'array'
     or (p_data ? 'recommendations' and (
       pg_catalog.jsonb_typeof(p_data->'recommendations') <> 'string'
       or pg_catalog.char_length(p_data->>'recommendations') > 2000))
     or (p_data ? 'next_actions' and (
       pg_catalog.jsonb_typeof(p_data->'next_actions') <> 'string'
       or pg_catalog.char_length(p_data->>'next_actions') > 2000)) then
    raise exception 'Datos del parte inválidos' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_data->'checklist') > 50 then
    raise exception 'La lista de comprobación supera 50 elementos'
      using errcode = '22023';
  end if;
  for item in select value from pg_catalog.jsonb_array_elements(p_data->'checklist') loop
    if pg_catalog.jsonb_typeof(item) <> 'object'
       or item - 'id' - 'label' - 'done' <> '{}'::jsonb
       or pg_catalog.jsonb_typeof(item->'id') <> 'string'
       or pg_catalog.char_length(item->>'id') not between 1 and 64
       or pg_catalog.jsonb_typeof(item->'label') <> 'string'
       or pg_catalog.char_length(pg_catalog.btrim(item->>'label')) not between 1 and 160
       or pg_catalog.jsonb_typeof(item->'done') <> 'boolean' then
      raise exception 'Elemento de comprobación inválido' using errcode = '22023';
    end if;
  end loop;
  if (
    select count(*) from pg_catalog.jsonb_array_elements(p_data->'checklist')
  ) <> (
    select count(distinct value->>'id')
    from pg_catalog.jsonb_array_elements(p_data->'checklist')
  ) then
    raise exception 'La lista contiene identificadores duplicados'
      using errcode = '22023';
  end if;

  if (select auth.uid()) is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  if not public.has_role(p_tenant_id,
    array['owner', 'admin', 'editor', 'technician']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para editar este parte'
      using errcode = '42501';
  end if;
  select * into target from public.service_visits
  where id = p_visit_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Visita no encontrada' using errcode = 'P0002'; end if;
  if not (
    public.has_role(p_tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
    or (target.assigned_user_id = (select auth.uid()) and
      public.has_role(p_tenant_id, array['technician']::public.app_role[]))
  ) then
    raise exception 'No tienes permiso para editar este parte'
      using errcode = '42501';
  end if;
  select * into prior from public.service_visit_report_writes
  where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.visit_id <> p_visit_id
       or prior.expected_revision <> p_expected_revision
       or prior.data <> p_data then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.revision;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede guardar partes' using errcode = 'P0402';
  end if;
  if target.status not in ('scheduled', 'in_progress') then
    raise exception 'Una visita cerrada no admite cambios en el borrador'
      using errcode = 'P0409';
  end if;
  select * into report from public.service_visit_reports
  where visit_id = p_visit_id and tenant_id = p_tenant_id;
  if coalesce(report.revision, 0) <> p_expected_revision then
    raise exception 'El parte cambió en otra sesión; compara las dos versiones'
      using errcode = 'P0409';
  end if;
  next_revision := p_expected_revision + 1;
  if report.visit_id is null then
    insert into public.service_visit_reports
      (visit_id, tenant_id, data, revision, updated_by)
    values (p_visit_id, p_tenant_id, p_data, next_revision, (select auth.uid()));
  else
    update public.service_visit_reports
    set data = p_data, revision = next_revision,
      updated_by = (select auth.uid()), updated_at = clock_timestamp()
    where visit_id = p_visit_id;
  end if;
  insert into public.service_visit_report_writes (
    operation_id, tenant_id, visit_id, expected_revision,
    revision, data, actor_id
  ) values (
    p_operation_id, p_tenant_id, p_visit_id, p_expected_revision,
    next_revision, p_data, (select auth.uid())
  );
  return next_revision;
end;
$$;
revoke all on function public.save_service_visit_report(
  uuid, uuid, bigint, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.save_service_visit_report(
  uuid, uuid, bigint, jsonb, uuid
) to authenticated;
