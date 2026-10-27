begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into public.tenants (id, name) values
  ('54000000-0000-4000-8000-000000000001', 'Empresa de campo'),
  ('54000000-0000-4000-8000-000000000002', 'Empresa ajena');
insert into public.clients (id, tenant_id, name) values
  ('54000000-0000-4000-8000-000000000003',
   '54000000-0000-4000-8000-000000000001', 'Cliente');
insert into public.service_locations (id, tenant_id, client_id, name, address)
values ('54000000-0000-4000-8000-000000000004',
  '54000000-0000-4000-8000-000000000001',
  '54000000-0000-4000-8000-000000000003', 'Centro', 'Calle Trabajo 1');
insert into public.work_orders
  (id, tenant_id, client_id, title, source_snapshot)
values ('54000000-0000-4000-8000-000000000005',
  '54000000-0000-4000-8000-000000000001',
  '54000000-0000-4000-8000-000000000003', 'Reparación', '{}');
insert into auth.users (id, email) values
  ('54000000-0000-4000-8000-000000000006', 'office-field@example.test'),
  ('54000000-0000-4000-8000-000000000007', 'tech-field@example.test'),
  ('54000000-0000-4000-8000-000000000008', 'other-tech-field@example.test'),
  ('54000000-0000-4000-8000-000000000009', 'foreign-field@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('54000000-0000-4000-8000-000000000001',
   '54000000-0000-4000-8000-000000000006', 'owner'),
  ('54000000-0000-4000-8000-000000000001',
   '54000000-0000-4000-8000-000000000007', 'technician'),
  ('54000000-0000-4000-8000-000000000001',
   '54000000-0000-4000-8000-000000000008', 'technician'),
  ('54000000-0000-4000-8000-000000000002',
   '54000000-0000-4000-8000-000000000009', 'owner');
insert into public.service_contracts (
  id, operation_id, tenant_id, client_id, location_id, title,
  starts_on, timezone, price_cents, billing_frequency,
  source_snapshot, created_by
) values (
  '54000000-0000-4000-8000-000000000030',
  '54000000-0000-4000-8000-000000000031',
  '54000000-0000-4000-8000-000000000001',
  '54000000-0000-4000-8000-000000000003',
  '54000000-0000-4000-8000-000000000004',
  'Mantenimiento', current_date, 'Europe/Madrid', 10000, 'monthly', '{}',
  '54000000-0000-4000-8000-000000000006'
);
insert into public.service_contract_visit_rules (
  id, tenant_id, contract_id, season, months, weekday,
  local_start, duration_minutes, title
) values (
  '54000000-0000-4000-8000-000000000032',
  '54000000-0000-4000-8000-000000000001',
  '54000000-0000-4000-8000-000000000030',
  'high', array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[], 1,
  '09:00', 60, 'Revisión'
);

set local role authenticated;
set local request.jwt.claim.sub = '54000000-0000-4000-8000-000000000006';
select set_config('test.field_visit', public.create_service_visit(
  '54000000-0000-4000-8000-000000000001',
  '54000000-0000-4000-8000-000000000003',
  '54000000-0000-4000-8000-000000000004', null,
  '54000000-0000-4000-8000-000000000005',
  'Reparación', '54000000-0000-4000-8000-000000000007',
  now(), now() + interval '1 hour', 'normal', '',
  '54000000-0000-4000-8000-000000000010'
)::text, true);
select ok(current_setting('test.field_visit')::uuid is not null,
  'Office creates a work-linked visit');

set local request.jwt.claim.sub = '54000000-0000-4000-8000-000000000007';
select set_config('test.field_entry', public.record_service_visit_field_entry(
  '54000000-0000-4000-8000-000000000001',
  current_setting('test.field_visit')::uuid,
  'labor', 'Ajuste de bomba', 45, 'min', now(), null,
  '54000000-0000-4000-8000-000000000011'
)::text, true);
select is((select count(*) from public.service_visit_field_entries
  where visit_id = current_setting('test.field_visit')::uuid), 1::bigint,
  'Assigned technician records time');
select is((select work_order_id from public.service_visit_field_entries
  where id = current_setting('test.field_entry')::uuid),
  '54000000-0000-4000-8000-000000000005'::uuid,
  'Field evidence snapshots its work origin');
select is(public.record_service_visit_field_entry(
  '54000000-0000-4000-8000-000000000001',
  current_setting('test.field_visit')::uuid,
  'labor', 'Ajuste de bomba', 45, 'min',
  (select occurred_at from public.service_visit_field_entries
   where id = current_setting('test.field_entry')::uuid), null,
  '54000000-0000-4000-8000-000000000011'),
  current_setting('test.field_entry')::uuid,
  'Retry with the same operation key is idempotent');
select throws_ok(
  $$select public.record_service_visit_field_entry(
    '54000000-0000-4000-8000-000000000001',
    current_setting('test.field_visit')::uuid,
    'labor', 'Ajuste de bomba', 50, 'min',
    (select occurred_at from public.service_visit_field_entries
     where id = current_setting('test.field_entry')::uuid), null,
    '54000000-0000-4000-8000-000000000011')$$,
  '23505', 'La clave de operación ya se utilizó con otros datos',
  'An operation key cannot be reused with different evidence');
select throws_ok(
  $$select public.record_service_visit_field_entry(
    '54000000-0000-4000-8000-000000000001',
    current_setting('test.field_visit')::uuid,
    'labor', 'Ajuste', 3, 'km', now(), null,
    '54000000-0000-4000-8000-000000000012')$$,
  '22023', 'Datos de actividad inválidos',
  'Labor cannot be measured in distance');
select throws_ok(
  $$insert into public.service_visit_field_entries (
    operation_id, tenant_id, visit_id, kind, description,
    quantity, unit, occurred_at, recorded_by
  ) values (
    '54000000-0000-4000-8000-000000000013',
    '54000000-0000-4000-8000-000000000001',
    current_setting('test.field_visit')::uuid,
    'labor', 'Sin comando', 1, 'min', now(),
    '54000000-0000-4000-8000-000000000007')$$,
  '42501', null, 'Technician cannot bypass the command');
select set_config('test.corrected_entry', public.record_service_visit_field_entry(
  '54000000-0000-4000-8000-000000000001',
  current_setting('test.field_visit')::uuid,
  'labor', 'Ajuste de bomba', 50, 'min', now(),
  current_setting('test.field_entry')::uuid,
  '54000000-0000-4000-8000-000000000014'
)::text, true);
select is((select count(*) from public.service_visit_field_entries
  where visit_id = current_setting('test.field_visit')::uuid), 2::bigint,
  'Correction keeps the original');
select is((select work_order_id from public.service_visit_field_entries
  where id = current_setting('test.corrected_entry')::uuid),
  '54000000-0000-4000-8000-000000000005'::uuid,
  'Correction keeps the same work origin');
select throws_ok(
  $$select public.record_service_visit_field_entry(
    '54000000-0000-4000-8000-000000000001',
    current_setting('test.field_visit')::uuid,
    'labor', 'Otra corrección', 40, 'min', now(),
    current_setting('test.field_entry')::uuid,
    '54000000-0000-4000-8000-000000000015')$$,
  'P0409', 'Esta actividad ya tiene una corrección',
  'A field entry cannot fork into two corrections');
select throws_ok(
  $$update public.service_visit_field_entries set quantity = 1
    where id = current_setting('test.field_entry')::uuid$$,
  '42501', null, 'A technician cannot rewrite history');

set local request.jwt.claim.sub = '54000000-0000-4000-8000-000000000008';
select is((select count(*) from public.service_visit_field_entries), 0::bigint,
  'Another technician cannot see the field evidence');
select throws_ok(
  $$select public.record_service_visit_field_entry(
    '54000000-0000-4000-8000-000000000001',
    current_setting('test.field_visit')::uuid,
    'travel', 'Desplazamiento', 12, 'km', now(), null,
    '54000000-0000-4000-8000-000000000016')$$,
  '42501', 'No tienes permiso para registrar actividad',
  'Another technician cannot record this visit');

set local request.jwt.claim.sub = '54000000-0000-4000-8000-000000000009';
select is((select count(*) from public.service_visit_field_entries), 0::bigint,
  'Another company cannot read field evidence');
select throws_ok(
  $$select public.record_service_visit_field_entry(
    '54000000-0000-4000-8000-000000000001',
    current_setting('test.field_visit')::uuid,
    'travel', 'Desplazamiento', 12, 'km', now(), null,
    '54000000-0000-4000-8000-000000000017')$$,
  '42501', 'No tienes permiso para registrar actividad',
  'Another company cannot record this visit');

set local role postgres;
insert into public.service_visits (
  id, operation_id, tenant_id, client_id, location_id, title,
  assigned_user_id, scheduled_start_at, scheduled_end_at, created_by,
  contract_id, contract_rule_id, contract_occurrence_on,
  contract_schedule_version
) values (
  '54000000-0000-4000-8000-000000000035',
  '54000000-0000-4000-8000-000000000033',
  '54000000-0000-4000-8000-000000000001',
  '54000000-0000-4000-8000-000000000003',
  '54000000-0000-4000-8000-000000000004',
  'Revisión contractual', '54000000-0000-4000-8000-000000000007',
  now() + interval '2 hours', now() + interval '3 hours',
  '54000000-0000-4000-8000-000000000006',
  '54000000-0000-4000-8000-000000000030',
  '54000000-0000-4000-8000-000000000032', current_date, 1
);
set local role authenticated;
set local request.jwt.claim.sub = '54000000-0000-4000-8000-000000000006';
select ok((select count(*) from public.service_visits
  where id = '54000000-0000-4000-8000-000000000035') = 1,
  'Contract visit exists');
select set_config('test.contract_entry', public.record_service_visit_field_entry(
  '54000000-0000-4000-8000-000000000001',
  '54000000-0000-4000-8000-000000000035',
  'product', 'Cloro', 2, 'L', now(), null,
  '54000000-0000-4000-8000-000000000034'
)::text, true);
select is((select contract_id from public.service_visit_field_entries
  where id = current_setting('test.contract_entry')::uuid),
  '54000000-0000-4000-8000-000000000030'::uuid,
  'Product use keeps its contract origin');
set local role postgres;
update public.service_visits set status = 'completed'
where id = '54000000-0000-4000-8000-000000000035';
set local role authenticated;
set local request.jwt.claim.sub = '54000000-0000-4000-8000-000000000006';
select throws_ok(
  $$select public.record_service_visit_field_entry(
    '54000000-0000-4000-8000-000000000001',
    '54000000-0000-4000-8000-000000000035',
    'product', 'Cloro', 1, 'L', now(), null,
    '54000000-0000-4000-8000-000000000036')$$,
  'P0409', 'La visita cerrada no admite nuevas actividades',
  'A closed visit rejects new field evidence');
select * from finish();
rollback;
