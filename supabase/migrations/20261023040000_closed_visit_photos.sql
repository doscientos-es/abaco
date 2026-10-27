-- Include private, immutable photo references in each newly closed report.
create or replace function public.build_closed_visit_report_snapshot(p_visit_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_visits%rowtype;
  closed_snapshot jsonb;
begin
  select * into target from public.service_visits where id = p_visit_id;
  if not found then
    raise exception 'Visita no encontrada' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
    'company', jsonb_build_object('id', t.id, 'name', t.name),
    'client', jsonb_build_object('id', c.id, 'name', c.name),
    'location', case when l.id is null then null else jsonb_build_object(
      'id', l.id, 'name', l.name, 'address', l.address) end,
    'asset', case when a.id is null then null else jsonb_build_object(
      'id', a.id, 'name', a.name, 'kind', a.kind) end,
    'visit', jsonb_build_object(
      'id', target.id, 'title', target.title, 'priority', target.priority,
      'scheduled_start_at', target.scheduled_start_at,
      'scheduled_end_at', target.scheduled_end_at,
      'actual_start_at', target.actual_start_at,
      'actual_end_at', target.actual_end_at,
      'work_order_id', target.work_order_id, 'contract_id', target.contract_id),
    'report', jsonb_build_object(
      'revision', coalesce(r.revision, 0),
      'data', coalesce(r.data,
        jsonb_build_object('notes', '', 'checklist', jsonb_build_array()))),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object(
      'id', task.id, 'title', task.title, 'status', task.status,
      'phase', phase.title) order by phase.position, task.position)
      from public.work_order_tasks task
      join public.work_order_phases phase on phase.id = task.phase_id
        and phase.tenant_id = task.tenant_id
      where task.tenant_id = target.tenant_id
        and task.work_order_id = target.work_order_id), '[]'::jsonb),
    'measurements', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'label', m.label_snapshot, 'value', m.value,
      'unit', m.unit_snapshot, 'assessment', m.assessment,
      'min', m.min_snapshot, 'max', m.max_snapshot,
      'method', m.method, 'measured_at', m.measured_at)
      order by m.measured_at, m.id)
      from public.service_visit_measurements m
      where m.tenant_id = target.tenant_id and m.visit_id = target.id
        and not exists (select 1 from public.service_visit_measurements correction
          where correction.supersedes_id = m.id)), '[]'::jsonb),
    'activities', coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'kind', e.kind, 'description', e.description,
      'quantity', e.quantity, 'unit', e.unit, 'occurred_at', e.occurred_at)
      order by e.occurred_at, e.id)
      from public.service_visit_field_entries e
      where e.tenant_id = target.tenant_id and e.visit_id = target.id
        and not exists (select 1 from public.service_visit_field_entries correction
          where correction.supersedes_id = e.id)), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'phase', p.phase, 'caption', p.caption,
      'storage_path', p.storage_path, 'created_at', p.created_at)
      order by p.created_at, p.id)
      from public.service_visit_photos p
      where p.tenant_id = target.tenant_id and p.visit_id = target.id),
      '[]'::jsonb),
    'incidents', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'title', i.title, 'description', i.description,
      'priority', i.priority, 'status', i.status,
      'diagnosis', i.diagnosis, 'resolution', i.resolution)
      order by i.created_at, i.id)
      from public.service_incidents i
      where i.tenant_id = target.tenant_id and i.source_visit_id = target.id),
      '[]'::jsonb)
  ) into closed_snapshot
  from public.tenants t
  join public.clients c on c.id = target.client_id and c.tenant_id = target.tenant_id
  left join public.service_locations l on l.id = target.location_id
    and l.tenant_id = target.tenant_id
  left join public.service_assets a on a.id = target.asset_id
    and a.tenant_id = target.tenant_id
  left join public.service_visit_reports r on r.visit_id = target.id
    and r.tenant_id = target.tenant_id
  where t.id = target.tenant_id;
  if closed_snapshot is null then
    raise exception 'No se pudo cerrar el parte de la visita'
      using errcode = 'P0409';
  end if;
  return closed_snapshot;
end;
$$;
