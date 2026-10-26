begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.tenants (id, name) values
  ('43000000-0000-4000-8000-000000000001', 'Empresa tareas');
insert into public.clients (id, tenant_id, name) values
  ('43000000-0000-4000-8000-000000000002',
    '43000000-0000-4000-8000-000000000001', 'Cliente tareas');
insert into auth.users (id, email) values
  ('43000000-0000-4000-8000-000000000003', 'editor-structure@example.test'),
  ('43000000-0000-4000-8000-000000000004', 'viewer-structure@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('43000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000003', 'editor'),
  ('43000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000004', 'viewer');

set local role authenticated;
set local request.jwt.claim.sub = '43000000-0000-4000-8000-000000000003';
select set_config('test.work_id', public.create_manual_work_order(
  '43000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000002',
  'Revisión técnica', 'maintenance', null, null, '',
  '43000000-0000-4000-8000-000000000005'
)::text, true);
select set_config('test.phase_result', public.apply_work_structure_command(
  '43000000-0000-4000-8000-000000000001',
  current_setting('test.work_id')::uuid,
  'phase_added', '{"title":"Preparación"}'::jsonb,
  '43000000-0000-4000-8000-000000000006'
)::text, true);
select is((select count(*) from public.work_order_phases), 1::bigint,
  'One phase is added to the work order');
select is(public.apply_work_structure_command(
  '43000000-0000-4000-8000-000000000001',
  current_setting('test.work_id')::uuid,
  'phase_added', '{"title":"Preparación"}'::jsonb,
  '43000000-0000-4000-8000-000000000006'
)::text, current_setting('test.phase_result'),
  'Retrying a phase command returns its first result');
select throws_ok(
  $$select public.apply_work_structure_command(
    '43000000-0000-4000-8000-000000000001',
    current_setting('test.work_id')::uuid,
    'phase_added', '{"title":"Otra fase"}'::jsonb,
    '43000000-0000-4000-8000-000000000006')$$,
  '23505', 'La clave de operación ya se utilizó con otros datos',
  'The same operation key cannot create another phase');
select set_config('test.task_result', public.apply_work_structure_command(
  '43000000-0000-4000-8000-000000000001',
  current_setting('test.work_id')::uuid,
  'task_added', jsonb_build_object(
    'phase_id', (current_setting('test.phase_result')::jsonb->>'id')::uuid,
    'title', 'Comprobar bomba', 'notes', 'Antes de cerrar'
  ), '43000000-0000-4000-8000-000000000007'
)::text, true);
select is((select count(*) from public.work_order_tasks), 1::bigint,
  'A task belongs to the selected phase');
select set_config('test.item_result', public.apply_work_structure_command(
  '43000000-0000-4000-8000-000000000001',
  current_setting('test.work_id')::uuid,
  'checklist_item_added', jsonb_build_object(
    'task_id', (current_setting('test.task_result')::jsonb->>'id')::uuid,
    'label', 'Medir presión'
  ), '43000000-0000-4000-8000-000000000008'
)::text, true);
select is((select count(*) from public.work_task_checklist_items), 1::bigint,
  'A checklist item belongs to the selected task');
select set_config('test.work_version', (
  select updated_at::text from public.work_orders
  where id = current_setting('test.work_id')::uuid
), true);
select set_config('test.work_status', public.transition_work_order(
  '43000000-0000-4000-8000-000000000001',
  current_setting('test.work_id')::uuid,
  current_setting('test.work_version')::timestamptz,
  'in_progress', '43000000-0000-4000-8000-000000000009'
), true);
select set_config('test.work_version', (
  select updated_at::text from public.work_orders
  where id = current_setting('test.work_id')::uuid
), true);
select throws_ok(
  $$select public.transition_work_order(
    '43000000-0000-4000-8000-000000000001',
    current_setting('test.work_id')::uuid,
    current_setting('test.work_version')::timestamptz,
    'completed', '43000000-0000-4000-8000-000000000010')$$,
  'P0409', 'Termina o descarta las tareas pendientes antes de cerrar el trabajo',
  'A work order cannot close with an open task');
select set_config('test.task_version', (
  select updated_at::text from public.work_order_tasks
  where id = (current_setting('test.task_result')::jsonb->>'id')::uuid
), true);
select throws_ok(
  $$select public.apply_work_structure_command(
    '43000000-0000-4000-8000-000000000001',
    current_setting('test.work_id')::uuid,
    'task_status_changed', jsonb_build_object(
      'task_id', (current_setting('test.task_result')::jsonb->>'id')::uuid,
      'status', 'done', 'expected_updated_at', current_setting('test.task_version')
    ), '43000000-0000-4000-8000-000000000011')$$,
  'P0409', 'Completa la lista de comprobación antes de terminar la tarea',
  'A task cannot finish with an unchecked item');
select set_config('test.item_version', (
  select updated_at::text from public.work_task_checklist_items
  where id = (current_setting('test.item_result')::jsonb->>'id')::uuid
), true);
select set_config('test.check_result', public.apply_work_structure_command(
  '43000000-0000-4000-8000-000000000001',
  current_setting('test.work_id')::uuid,
  'checklist_item_changed', jsonb_build_object(
    'item_id', (current_setting('test.item_result')::jsonb->>'id')::uuid,
    'done', true, 'expected_updated_at', current_setting('test.item_version')
  ), '43000000-0000-4000-8000-000000000012'
)::text, true);
select ok((select done from public.work_task_checklist_items),
  'The checklist item records completion');
select is(public.apply_work_structure_command(
  '43000000-0000-4000-8000-000000000001',
  current_setting('test.work_id')::uuid,
  'checklist_item_changed', jsonb_build_object(
    'item_id', (current_setting('test.item_result')::jsonb->>'id')::uuid,
    'done', true, 'expected_updated_at', current_setting('test.item_version')
  ), '43000000-0000-4000-8000-000000000012'
)::text, current_setting('test.check_result'),
  'Retrying a checklist change returns the original result');
select set_config('test.done_result', public.apply_work_structure_command(
  '43000000-0000-4000-8000-000000000001',
  current_setting('test.work_id')::uuid,
  'task_status_changed', jsonb_build_object(
    'task_id', (current_setting('test.task_result')::jsonb->>'id')::uuid,
    'status', 'done', 'expected_updated_at', current_setting('test.task_version')
  ), '43000000-0000-4000-8000-000000000013'
)::text, true);
select is((select status from public.work_order_tasks), 'done',
  'The task can finish after its checklist is complete');
select throws_ok(
  $$select public.apply_work_structure_command(
    '43000000-0000-4000-8000-000000000001',
    current_setting('test.work_id')::uuid,
    'task_status_changed', jsonb_build_object(
      'task_id', (current_setting('test.task_result')::jsonb->>'id')::uuid,
      'status', 'pending', 'expected_updated_at', current_setting('test.task_version')
    ), '43000000-0000-4000-8000-000000000014')$$,
  'P0409', 'La tarea cambió en otra sesión; recarga la ficha',
  'A stale task status cannot overwrite completion');
select set_config('test.work_version', (
  select updated_at::text from public.work_orders
  where id = current_setting('test.work_id')::uuid
), true);
select set_config('test.work_status', public.transition_work_order(
  '43000000-0000-4000-8000-000000000001',
  current_setting('test.work_id')::uuid,
  current_setting('test.work_version')::timestamptz,
  'completed', '43000000-0000-4000-8000-000000000015'
), true);
select is((select status from public.work_orders), 'completed',
  'The work order closes after its tasks are complete');
select throws_ok(
  $$select public.apply_work_structure_command(
    '43000000-0000-4000-8000-000000000001',
    current_setting('test.work_id')::uuid,
    'phase_added', '{"title":"Tardía"}'::jsonb,
    '43000000-0000-4000-8000-000000000016')$$,
  'P0409', 'No se puede modificar un trabajo cerrado',
  'Closed work cannot gain new tasks or phases');

set local request.jwt.claim.sub = '43000000-0000-4000-8000-000000000004';
select throws_ok(
  $$select public.apply_work_structure_command(
    '43000000-0000-4000-8000-000000000001',
    current_setting('test.work_id')::uuid,
    'phase_added', '{"title":"Sin permiso"}'::jsonb,
    '43000000-0000-4000-8000-000000000017')$$,
  '42501', 'No tienes permiso para modificar trabajos',
  'A viewer cannot modify work structure');
select is((select count(*) from public.work_order_events), 8::bigint,
  'Creation, structure and status changes each leave one event');

select * from finish();
rollback;
