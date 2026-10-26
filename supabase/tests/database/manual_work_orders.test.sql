begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into public.tenants (id, name) values
  ('42000000-0000-4000-8000-000000000001', 'Empresa trabajo manual');
insert into public.clients (id, tenant_id, name) values
  ('42000000-0000-4000-8000-000000000002',
    '42000000-0000-4000-8000-000000000001', 'Cliente original');
insert into public.service_locations (id, tenant_id, client_id, name, address) values
  ('42000000-0000-4000-8000-000000000003',
    '42000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000002', 'Casa', 'Calle Uno 1'),
  ('42000000-0000-4000-8000-000000000004',
    '42000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000002', 'Local', 'Calle Dos 2');
insert into public.service_assets (id, tenant_id, location_id, kind, name) values
  ('42000000-0000-4000-8000-000000000005',
    '42000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000003', 'pool', 'Piscina exterior');
insert into auth.users (id, email) values
  ('42000000-0000-4000-8000-000000000006', 'editor-work-manual@example.test'),
  ('42000000-0000-4000-8000-000000000007', 'viewer-work-manual@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('42000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000006', 'editor'),
  ('42000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000007', 'viewer');

set local role authenticated;
set local request.jwt.claim.sub = '42000000-0000-4000-8000-000000000006';
select set_config('test.manual_work_id', public.create_manual_work_order(
  '42000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000002',
  'Reparar bomba', 'repair',
  '42000000-0000-4000-8000-000000000003',
  '42000000-0000-4000-8000-000000000005',
  'Bomba sin presión', '42000000-0000-4000-8000-000000000008'
)::text, true);
select is((select count(*) from public.work_orders), 1::bigint,
  'An editor creates one manual work order');
select is((select source_snapshot #>> '{origin_kind}' from public.work_orders), 'manual',
  'The work order marks its manual origin');
select is((select source_snapshot #>> '{client,name}' from public.work_orders),
  'Cliente original', 'The client name is captured at creation');
select is((select source_snapshot #>> '{location,address}' from public.work_orders),
  'Calle Uno 1', 'The original service address is captured');
select is((select source_snapshot #>> '{asset,name}' from public.work_orders),
  'Piscina exterior', 'The selected asset is captured');
select is(public.create_manual_work_order(
  '42000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000002',
  'Reparar bomba', 'repair',
  '42000000-0000-4000-8000-000000000003',
  '42000000-0000-4000-8000-000000000005',
  'Bomba sin presión', '42000000-0000-4000-8000-000000000008'
)::text, current_setting('test.manual_work_id'),
  'Retrying the same operation returns its original work order');
select is((select count(*) from public.work_order_events), 1::bigint,
  'A retry does not duplicate creation history');
select throws_ok(
  $$select public.create_manual_work_order(
    '42000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000002',
    'Otro título', 'repair', null, null, '',
    '42000000-0000-4000-8000-000000000008')$$,
  '23505', 'La clave de operación ya se utilizó con otros datos',
  'Reusing a key for different work is rejected');
select throws_ok(
  $$select public.create_manual_work_order(
    '42000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000002',
    'Activo cruzado', 'repair',
    '42000000-0000-4000-8000-000000000004',
    '42000000-0000-4000-8000-000000000005', '',
    '42000000-0000-4000-8000-000000000009')$$,
  'P0409', 'Activo no válido',
  'An asset from another location cannot be selected');
select set_config('test.work_version', (
  select updated_at::text from public.work_orders
  where id = current_setting('test.manual_work_id')::uuid
), true);
select throws_ok(
  $$select public.transition_work_order(
    '42000000-0000-4000-8000-000000000001',
    current_setting('test.manual_work_id')::uuid,
    current_setting('test.work_version')::timestamptz,
    'scheduled', '42000000-0000-4000-8000-000000000014')$$,
  'P0409', 'Indica el inicio previsto antes de planificar el trabajo',
  'A work order needs a planned start before scheduling');
select set_config('test.planned_version', public.update_work_order_plan(
  '42000000-0000-4000-8000-000000000001',
  current_setting('test.manual_work_id')::uuid,
  current_setting('test.work_version')::timestamptz,
  '42000000-0000-4000-8000-000000000006',
  '2026-10-25 08:00:00+02', '2026-10-25 10:00:00+02',
  'Llevar repuesto', '42000000-0000-4000-8000-000000000011'
)::text, true);
select is((select responsible_user_id::text from public.work_orders),
  '42000000-0000-4000-8000-000000000006',
  'Planning assigns a company member');
select is((select description from public.work_orders), 'Llevar repuesto',
  'Planning stores operational notes');
select is((select count(*) from public.work_order_events), 2::bigint,
  'Planning writes an audit event');
select is(public.update_work_order_plan(
  '42000000-0000-4000-8000-000000000001',
  current_setting('test.manual_work_id')::uuid,
  current_setting('test.work_version')::timestamptz,
  '42000000-0000-4000-8000-000000000006',
  '2026-10-25 08:00:00+02', '2026-10-25 10:00:00+02',
  'Llevar repuesto', '42000000-0000-4000-8000-000000000011'
)::text, current_setting('test.planned_version'),
  'Retrying the same plan returns its original version');
select throws_ok(
  $$select public.update_work_order_plan(
    '42000000-0000-4000-8000-000000000001',
    current_setting('test.manual_work_id')::uuid,
    current_setting('test.work_version')::timestamptz,
    null, null, null, 'Otra nota',
    '42000000-0000-4000-8000-000000000012')$$,
  'P0409', 'El trabajo cambió en otra sesión; recarga la ficha',
  'A stale plan cannot overwrite another session');
select throws_ok(
  $$select public.update_work_order_plan(
    '42000000-0000-4000-8000-000000000001',
    current_setting('test.manual_work_id')::uuid,
    current_setting('test.planned_version')::timestamptz,
    '42000000-0000-4000-8000-000000000099',
    null, null, 'Llevar repuesto',
    '42000000-0000-4000-8000-000000000013')$$,
  'P0409', 'La persona responsable no pertenece a la empresa',
  'Planning cannot assign somebody outside the company');
select set_config('test.transition_result', public.transition_work_order(
  '42000000-0000-4000-8000-000000000001',
  current_setting('test.manual_work_id')::uuid,
  current_setting('test.planned_version')::timestamptz,
  'scheduled', '42000000-0000-4000-8000-000000000015'
), true);
select is((select status from public.work_orders), 'scheduled',
  'A planned work order can be scheduled');
select set_config('test.scheduled_version', (
  select updated_at::text from public.work_orders
  where id = current_setting('test.manual_work_id')::uuid
), true);
select set_config('test.transition_result', public.transition_work_order(
  '42000000-0000-4000-8000-000000000001',
  current_setting('test.manual_work_id')::uuid,
  current_setting('test.scheduled_version')::timestamptz,
  'in_progress', '42000000-0000-4000-8000-000000000016'
), true);
select ok((select actual_start_at is not null from public.work_orders),
  'Starting work records server time');
select set_config('test.started_version', (
  select updated_at::text from public.work_orders
  where id = current_setting('test.manual_work_id')::uuid
), true);
select set_config('test.transition_result', public.transition_work_order(
  '42000000-0000-4000-8000-000000000001',
  current_setting('test.manual_work_id')::uuid,
  current_setting('test.started_version')::timestamptz,
  'completed', '42000000-0000-4000-8000-000000000017'
), true);
select ok((select actual_end_at >= actual_start_at from public.work_orders),
  'Completing work records an end after its start');

set local role postgres;
select throws_ok(
  $$update public.work_orders set asset_id =
    '42000000-0000-4000-8000-000000000005',
    location_id = '42000000-0000-4000-8000-000000000004'
    where id = current_setting('test.manual_work_id')::uuid$$,
  '23514', 'El activo no pertenece a la ubicación del trabajo',
  'The database rejects an asset moved to another location');

set local role authenticated;
set local request.jwt.claim.sub = '42000000-0000-4000-8000-000000000007';
select throws_ok(
  $$select public.create_manual_work_order(
    '42000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000002',
    'Intento sin permiso', 'repair', null, null, '',
    '42000000-0000-4000-8000-000000000010')$$,
  '42501', 'No tienes permiso para crear trabajos',
  'A viewer cannot create manual work');

select * from finish();
rollback;
