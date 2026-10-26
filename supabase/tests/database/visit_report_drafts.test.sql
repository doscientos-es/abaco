begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into public.tenants (id, name) values
  ('52000000-0000-4000-8000-000000000001', 'Empresa de partes'),
  ('52000000-0000-4000-8000-000000000015', 'Empresa ajena');
insert into public.clients (id, tenant_id, name) values
  ('52000000-0000-4000-8000-000000000002',
   '52000000-0000-4000-8000-000000000001', 'Cliente de partes');
insert into auth.users (id, email) values
  ('52000000-0000-4000-8000-000000000003', 'owner-report@example.test'),
  ('52000000-0000-4000-8000-000000000004', 'tech-report@example.test'),
  ('52000000-0000-4000-8000-000000000005', 'other-report@example.test'),
  ('52000000-0000-4000-8000-000000000016', 'foreign-report@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('52000000-0000-4000-8000-000000000001',
   '52000000-0000-4000-8000-000000000003', 'owner'),
  ('52000000-0000-4000-8000-000000000001',
   '52000000-0000-4000-8000-000000000004', 'technician'),
  ('52000000-0000-4000-8000-000000000001',
   '52000000-0000-4000-8000-000000000005', 'technician'),
  ('52000000-0000-4000-8000-000000000015',
   '52000000-0000-4000-8000-000000000016', 'owner');
set local role authenticated;
set local request.jwt.claim.sub = '52000000-0000-4000-8000-000000000003';
select set_config('test.report_visit_id', public.create_service_visit(
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000002', null, null, null,
  'Revisión técnica', '52000000-0000-4000-8000-000000000004',
  '2026-10-22 08:00+00', '2026-10-22 09:00+00', 'normal', '',
  '52000000-0000-4000-8000-000000000006'
)::text, true);

set local request.jwt.claim.sub = '52000000-0000-4000-8000-000000000004';
select is(public.save_service_visit_report(
    '52000000-0000-4000-8000-000000000001',
    current_setting('test.report_visit_id')::uuid, 0,
    '{"notes":"Se revisó la bomba","checklist":[{"id":"bomba","label":"Comprobar bomba","done":false}]}'::jsonb,
    '52000000-0000-4000-8000-000000000007'),
  1::bigint, 'Assigned technician creates revision one');
select is((select data #>> '{checklist,0,label}' from public.service_visit_reports),
  'Comprobar bomba', 'The draft persists its checklist');
select is(public.save_service_visit_report(
    '52000000-0000-4000-8000-000000000001',
    current_setting('test.report_visit_id')::uuid, 0,
    '{"notes":"Se revisó la bomba","checklist":[{"id":"bomba","label":"Comprobar bomba","done":false}]}'::jsonb,
    '52000000-0000-4000-8000-000000000007'),
  1::bigint, 'Retrying the same operation is idempotent');
select throws_ok(
  $$select public.save_service_visit_report(
    '52000000-0000-4000-8000-000000000001',
    current_setting('test.report_visit_id')::uuid, 0,
    '{"notes":"Otros datos","checklist":[]}'::jsonb,
    '52000000-0000-4000-8000-000000000007')$$,
  '23505', 'La clave de operación ya se utilizó con otros datos',
  'An operation key cannot write changed data');
select throws_ok(
  $$select public.save_service_visit_report(
    '52000000-0000-4000-8000-000000000001',
    current_setting('test.report_visit_id')::uuid, 0,
    '{"notes":"Borrador desconectado","checklist":[]}'::jsonb,
    '52000000-0000-4000-8000-000000000008')$$,
  'P0409', 'El parte cambió en otra sesión; compara las dos versiones',
  'Stale offline draft cannot overwrite a newer revision');
select is((select revision from public.service_visit_reports), 1::bigint,
  'A conflict leaves the saved version intact');
select throws_ok(
  $$select public.save_service_visit_report(
    '52000000-0000-4000-8000-000000000001',
    current_setting('test.report_visit_id')::uuid, 1,
    '{"notes":"Duplicado","checklist":[{"id":"x","label":"A","done":false},{"id":"x","label":"B","done":true}]}'::jsonb,
    '52000000-0000-4000-8000-000000000009')$$,
  '22023', 'La lista contiene identificadores duplicados',
  'Duplicate checklist identifiers are rejected');
select is(public.save_service_visit_report(
    '52000000-0000-4000-8000-000000000001',
    current_setting('test.report_visit_id')::uuid, 1,
    '{"notes":"Bomba correcta","checklist":[{"id":"bomba","label":"Comprobar bomba","done":true}]}'::jsonb,
    '52000000-0000-4000-8000-000000000010'),
  2::bigint, 'A fresh revision advances the draft');
select is((select count(*) from public.service_visit_report_writes), 2::bigint,
  'Every accepted save keeps one immutable history row');
select throws_ok(
  $$update public.service_visit_reports set data = '{}'::jsonb$$,
  '42501', null, 'Technician cannot bypass the save command with direct UPDATE');

set local request.jwt.claim.sub = '52000000-0000-4000-8000-000000000005';
select is((select count(*) from public.service_visit_reports), 0::bigint,
  'Another technician cannot read the assigned draft');
select is((select count(*) from public.service_visit_report_writes), 0::bigint,
  'Another technician cannot read draft history');
select throws_ok(
  $$select public.save_service_visit_report(
    '52000000-0000-4000-8000-000000000001',
    current_setting('test.report_visit_id')::uuid, 2,
    '{"notes":"Indebido","checklist":[]}'::jsonb,
    '52000000-0000-4000-8000-000000000011')$$,
  '42501', 'No tienes permiso para editar este parte',
  'Another technician cannot mutate the draft');

set local request.jwt.claim.sub = '52000000-0000-4000-8000-000000000016';
select is((select count(*) from public.service_visit_reports), 0::bigint,
  'Another company cannot read the report');
select throws_ok(
  $$select public.save_service_visit_report(
    '52000000-0000-4000-8000-000000000001',
    current_setting('test.report_visit_id')::uuid, 2,
    '{"notes":"Empresa ajena","checklist":[]}'::jsonb,
    '52000000-0000-4000-8000-000000000017')$$,
  '42501', 'No tienes permiso para editar este parte',
  'Another company cannot probe or mutate the visit through the command');

set local request.jwt.claim.sub = '52000000-0000-4000-8000-000000000003';
select is((select revision from public.service_visit_reports), 2::bigint,
  'Office can review the technician draft');
select set_config('test.report_visit_version', (
  select updated_at from public.service_visits
  where id = current_setting('test.report_visit_id')::uuid
)::text, true);
select public.transition_service_visit(
  '52000000-0000-4000-8000-000000000001',
  current_setting('test.report_visit_id')::uuid,
  current_setting('test.report_visit_version')::timestamptz,
  'in_progress', '', '52000000-0000-4000-8000-000000000012');
select public.transition_service_visit(
  '52000000-0000-4000-8000-000000000001',
  current_setting('test.report_visit_id')::uuid,
  (select updated_at from public.service_visits
   where id = current_setting('test.report_visit_id')::uuid),
  'completed', '', '52000000-0000-4000-8000-000000000013');
select throws_ok(
  $$select public.save_service_visit_report(
    '52000000-0000-4000-8000-000000000001',
    current_setting('test.report_visit_id')::uuid, 2,
    '{"notes":"Después del cierre","checklist":[]}'::jsonb,
    '52000000-0000-4000-8000-000000000014')$$,
  'P0409', 'Una visita cerrada no admite cambios en el borrador',
  'A closed visit cannot gain another draft revision');
select is(public.save_service_visit_report(
    '52000000-0000-4000-8000-000000000001',
    current_setting('test.report_visit_id')::uuid, 1,
    '{"notes":"Bomba correcta","checklist":[{"id":"bomba","label":"Comprobar bomba","done":true}]}'::jsonb,
    '52000000-0000-4000-8000-000000000010'),
  2::bigint, 'The last successful operation can be retried after close');
select * from finish();
rollback;
