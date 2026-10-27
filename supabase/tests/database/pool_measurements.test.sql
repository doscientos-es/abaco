begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into public.tenants (id, name) values
  ('53000000-0000-4000-8000-000000000001', 'Empresa lecturas'),
  ('53000000-0000-4000-8000-000000000002', 'Empresa ajena');
insert into public.clients (id, tenant_id, name) values
  ('53000000-0000-4000-8000-000000000003',
   '53000000-0000-4000-8000-000000000001', 'Cliente piscina');
insert into public.service_locations
  (id, tenant_id, client_id, name, address) values
  ('53000000-0000-4000-8000-000000000004',
   '53000000-0000-4000-8000-000000000001',
   '53000000-0000-4000-8000-000000000003', 'Ubicación', 'Calle Agua 1');
insert into public.service_assets
  (id, tenant_id, location_id, kind, name) values
  ('53000000-0000-4000-8000-000000000005',
   '53000000-0000-4000-8000-000000000001',
   '53000000-0000-4000-8000-000000000004', 'pool', 'Piscina principal');
insert into public.pool_profiles (asset_id, tenant_id) values
  ('53000000-0000-4000-8000-000000000005',
   '53000000-0000-4000-8000-000000000001');
select is((select count(*) from public.pool_measurement_parameters), 3::bigint,
  'A pool starts with pH, disinfectant and temperature definitions');
select is((select count(*) from public.pool_measurement_parameters
  where min_value is null and max_value is null), 3::bigint,
  'Core parameters have no invented regulatory range');
insert into auth.users (id, email) values
  ('53000000-0000-4000-8000-000000000006', 'office-measure@example.test'),
  ('53000000-0000-4000-8000-000000000007', 'tech-measure@example.test'),
  ('53000000-0000-4000-8000-000000000008', 'other-tech-measure@example.test'),
  ('53000000-0000-4000-8000-000000000009', 'foreign-measure@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('53000000-0000-4000-8000-000000000001',
   '53000000-0000-4000-8000-000000000006', 'owner'),
  ('53000000-0000-4000-8000-000000000001',
   '53000000-0000-4000-8000-000000000007', 'technician'),
  ('53000000-0000-4000-8000-000000000001',
   '53000000-0000-4000-8000-000000000008', 'technician'),
  ('53000000-0000-4000-8000-000000000002',
   '53000000-0000-4000-8000-000000000009', 'owner');

set local role authenticated;
set local request.jwt.claim.sub = '53000000-0000-4000-8000-000000000006';
select set_config('test.ph_id', (
  select id from public.pool_measurement_parameters
  where asset_id = '53000000-0000-4000-8000-000000000005' and code = 'ph'
)::text, true);
select is(public.configure_pool_measurement_parameter(
    '53000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000005',
    'ph', 'pH', 'pH', 7.2, 7.6, true,
    (select updated_at from public.pool_measurement_parameters
     where id = current_setting('test.ph_id')::uuid),
    '53000000-0000-4000-8000-000000000010'),
  current_setting('test.ph_id')::uuid,
  'Office configures an operational pH range');
select is(public.configure_pool_measurement_parameter(
    '53000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000005',
    'ph', 'pH', 'pH', 7.2, 7.6, true,
    (select request->>'expected_updated_at' from public.pool_measurement_parameter_events
     where operation_id = '53000000-0000-4000-8000-000000000010')::timestamptz,
    '53000000-0000-4000-8000-000000000010'),
  current_setting('test.ph_id')::uuid,
  'Retrying configuration with the same key is idempotent');
select set_config('test.visit_id', public.create_service_visit(
  '53000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000003',
  '53000000-0000-4000-8000-000000000004',
  '53000000-0000-4000-8000-000000000005', null,
  'Control de agua', '53000000-0000-4000-8000-000000000007',
  now(), now() + interval '1 hour', 'normal', '',
  '53000000-0000-4000-8000-000000000011'
)::text, true);

set local request.jwt.claim.sub = '53000000-0000-4000-8000-000000000007';
select is((select count(*) from public.pool_measurement_parameters), 0::bigint,
  'Technician cannot browse pool configuration');
select is((select count(*) from public.visit_measurement_parameters(
  '53000000-0000-4000-8000-000000000001',
  current_setting('test.visit_id')::uuid)), 3::bigint,
  'Assigned technician receives only parameters for the visit pool');
select set_config('test.first_measurement', public.record_service_visit_measurement(
  '53000000-0000-4000-8000-000000000001',
  current_setting('test.visit_id')::uuid, current_setting('test.ph_id')::uuid,
  7.8, 'Fotómetro', 'Equipo A', now(), null,
  '53000000-0000-4000-8000-000000000012'
)::text, true);
select is((select assessment from public.service_visit_measurements
  where id = current_setting('test.first_measurement')::uuid), 'above',
  'Reading above the configured operational range is explained');
select is((select max_snapshot from public.service_visit_measurements
  where id = current_setting('test.first_measurement')::uuid), 7.6::numeric,
  'Reading copies the range active at measurement time');
select is(public.record_service_visit_measurement(
  '53000000-0000-4000-8000-000000000001',
  current_setting('test.visit_id')::uuid, current_setting('test.ph_id')::uuid,
  7.8, 'Fotómetro', 'Equipo A',
  (select measured_at from public.service_visit_measurements
   where id = current_setting('test.first_measurement')::uuid), null,
  '53000000-0000-4000-8000-000000000012'),
  current_setting('test.first_measurement')::uuid,
  'Retrying a reading never duplicates it');
select throws_ok(
  $$select public.record_service_visit_measurement(
    '53000000-0000-4000-8000-000000000001',
    current_setting('test.visit_id')::uuid, current_setting('test.ph_id')::uuid,
    15, 'Fotómetro', '', now(), null,
    '53000000-0000-4000-8000-000000000013')$$,
  '22023', 'Valor fuera del rango físico admitido para este parámetro',
  'Impossible pH values are rejected');
select set_config('test.disinfectant_id', (
  select parameter_id from public.visit_measurement_parameters(
    '53000000-0000-4000-8000-000000000001',
    current_setting('test.visit_id')::uuid)
  where code = 'disinfectant'
)::text, true);
select set_config('test.unconfigured_reading', public.record_service_visit_measurement(
  '53000000-0000-4000-8000-000000000001',
  current_setting('test.visit_id')::uuid,
  current_setting('test.disinfectant_id')::uuid,
  1.2, 'Tira reactiva', '', now(), null,
  '53000000-0000-4000-8000-000000000014'
)::text, true);
select is((select assessment from public.service_visit_measurements
  where id = current_setting('test.unconfigured_reading')::uuid), 'unconfigured',
  'A missing range is shown as unconfigured, not safe or unsafe');
select throws_ok(
  $$insert into public.service_visit_measurements
    (operation_id, tenant_id, visit_id, asset_id, parameter_id,
     value, code_snapshot, label_snapshot, unit_snapshot, assessment,
     method, measured_at, recorded_by)
    values ('53000000-0000-4000-8000-000000000015',
      '53000000-0000-4000-8000-000000000001',
      current_setting('test.visit_id')::uuid,
      '53000000-0000-4000-8000-000000000005',
      current_setting('test.ph_id')::uuid, 7.5, 'ph', 'pH', 'pH', 'within',
      'Manual', now(), '53000000-0000-4000-8000-000000000007')$$,
  '42501', null, 'Technician cannot bypass the recording command');

set local request.jwt.claim.sub = '53000000-0000-4000-8000-000000000008';
select is((select count(*) from public.service_visit_measurements), 0::bigint,
  'Another technician cannot read this visit readings');
select throws_ok(
  $$select public.visit_measurement_parameters(
    '53000000-0000-4000-8000-000000000001',
    current_setting('test.visit_id')::uuid)$$,
  '42501', 'No tienes permiso para consultar mediciones',
  'Another technician cannot load the pool parameters');
select throws_ok(
  $$select public.record_service_visit_measurement(
    '53000000-0000-4000-8000-000000000001',
    current_setting('test.visit_id')::uuid, current_setting('test.ph_id')::uuid,
    7.4, 'Fotómetro', '', now(), null,
    '53000000-0000-4000-8000-000000000016')$$,
  '42501', 'No tienes permiso para registrar mediciones',
  'Another technician cannot record for this visit');

set local request.jwt.claim.sub = '53000000-0000-4000-8000-000000000009';
select is((select count(*) from public.service_visit_measurements), 0::bigint,
  'A different company cannot read the readings');
select throws_ok(
  $$select public.record_service_visit_measurement(
    '53000000-0000-4000-8000-000000000001',
    current_setting('test.visit_id')::uuid, current_setting('test.ph_id')::uuid,
    7.4, 'Fotómetro', '', now(), null,
    '53000000-0000-4000-8000-000000000017')$$,
  '42501', 'No tienes permiso para registrar mediciones',
  'A different company cannot probe the recording command');

set local request.jwt.claim.sub = '53000000-0000-4000-8000-000000000006';
select is(public.configure_pool_measurement_parameter(
    '53000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000005',
    'ph', 'pH', 'pH', 6.5, 8.5, true,
    (select updated_at from public.pool_measurement_parameters
     where id = current_setting('test.ph_id')::uuid),
    '53000000-0000-4000-8000-000000000018'),
  current_setting('test.ph_id')::uuid,
  'Office can revise a range for future readings');
select is((select assessment from public.service_visit_measurements
  where id = current_setting('test.first_measurement')::uuid), 'above',
  'Changing the pool range does not rewrite the historical assessment');
select is((select count(*) from public.pool_measurement_parameter_events), 2::bigint,
  'Every parameter revision has one immutable audit event');
select set_config('test.correction', public.record_service_visit_measurement(
  '53000000-0000-4000-8000-000000000001',
  current_setting('test.visit_id')::uuid, current_setting('test.ph_id')::uuid,
  7.4, 'Fotómetro', 'Equipo A', now(),
  current_setting('test.first_measurement')::uuid,
  '53000000-0000-4000-8000-000000000019'
)::text, true);
select is((select assessment from public.service_visit_measurements
  where id = current_setting('test.correction')::uuid), 'within',
  'A correction uses the current range and keeps the original reading');
select is((select count(*) from public.service_visit_measurements
  where code_snapshot = 'ph'), 2::bigint,
  'The original and corrected readings remain in history');
select throws_ok(
  $$select public.record_service_visit_measurement(
    '53000000-0000-4000-8000-000000000001',
    current_setting('test.visit_id')::uuid, current_setting('test.ph_id')::uuid,
    7.3, 'Fotómetro', '', now(),
    current_setting('test.first_measurement')::uuid,
    '53000000-0000-4000-8000-000000000020')$$,
  'P0409', 'Esta lectura ya tiene una corrección',
  'A reading cannot fork into two direct corrections');
select set_config('test.custom_parameter', public.configure_pool_measurement_parameter(
  '53000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000005',
  'alkalinity', 'Alcalinidad', 'mg/L', 80, 120, true, null,
  '53000000-0000-4000-8000-000000000021'
)::text, true);
select is((select count(*) from public.visit_measurement_parameters(
  '53000000-0000-4000-8000-000000000001',
  current_setting('test.visit_id')::uuid)), 4::bigint,
  'Additional configured parameters appear for the visit');
select * from finish();
rollback;
