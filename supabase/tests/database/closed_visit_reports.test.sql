begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.tenants (id, name) values
  ('57000000-0000-4000-8000-000000000001', 'Empresa de informes'),
  ('57000000-0000-4000-8000-000000000002', 'Otra empresa');
insert into public.clients (id, tenant_id, name) values
  ('57000000-0000-4000-8000-000000000003',
   '57000000-0000-4000-8000-000000000001', 'Cliente del informe');
insert into auth.users (id, email) values
  ('57000000-0000-4000-8000-000000000004', 'office-closed-report@example.test'),
  ('57000000-0000-4000-8000-000000000005', 'tech-closed-report@example.test'),
  ('57000000-0000-4000-8000-000000000006', 'other-tech-closed-report@example.test'),
  ('57000000-0000-4000-8000-000000000007', 'foreign-closed-report@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('57000000-0000-4000-8000-000000000001',
   '57000000-0000-4000-8000-000000000004', 'owner'),
  ('57000000-0000-4000-8000-000000000001',
   '57000000-0000-4000-8000-000000000005', 'technician'),
  ('57000000-0000-4000-8000-000000000001',
   '57000000-0000-4000-8000-000000000006', 'technician'),
  ('57000000-0000-4000-8000-000000000002',
   '57000000-0000-4000-8000-000000000007', 'owner');

set local role authenticated;
set local request.jwt.claim.sub = '57000000-0000-4000-8000-000000000004';
select set_config('test.closed_visit', public.create_service_visit(
  '57000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000003', null, null, null,
  'Revisión', '57000000-0000-4000-8000-000000000005',
  now(), now() + interval '1 hour', 'normal', '',
  '57000000-0000-4000-8000-000000000008'
)::text, true);
select is((select count(*) from public.service_visit_report_versions), 0::bigint,
  'A scheduled visit has no closed report');

set local request.jwt.claim.sub = '57000000-0000-4000-8000-000000000005';
select is(public.save_service_visit_report(
  '57000000-0000-4000-8000-000000000001',
  current_setting('test.closed_visit')::uuid, 0,
  '{"notes":"Se revisó la instalación","checklist":[{"id":"ok","label":"Revisar bomba","done":true}]}'::jsonb,
  '57000000-0000-4000-8000-000000000009'), 1::bigint,
  'Technician saves the report draft');
select set_config('test.closed_entry', public.record_service_visit_field_entry(
  '57000000-0000-4000-8000-000000000001',
  current_setting('test.closed_visit')::uuid,
  'labor', 'Comprobación', 30, 'min', now(), null,
  '57000000-0000-4000-8000-000000000010'
)::text, true);
select ok(current_setting('test.closed_entry')::uuid is not null,
  'Technician records an activity');
select set_config('test.corrected_entry', public.record_service_visit_field_entry(
  '57000000-0000-4000-8000-000000000001',
  current_setting('test.closed_visit')::uuid,
  'labor', 'Comprobación corregida', 35, 'min', now(),
  current_setting('test.closed_entry')::uuid,
  '57000000-0000-4000-8000-000000000013'
)::text, true);
select ok(current_setting('test.corrected_entry')::uuid is not null,
  'Technician corrects an activity before closing');
select is(public.transition_service_visit(
  '57000000-0000-4000-8000-000000000001',
  current_setting('test.closed_visit')::uuid,
  (select updated_at from public.service_visits
    where id = current_setting('test.closed_visit')::uuid),
  'in_progress', '', '57000000-0000-4000-8000-000000000011'),
  'in_progress', 'Technician starts the visit');
select is(public.transition_service_visit(
  '57000000-0000-4000-8000-000000000001',
  current_setting('test.closed_visit')::uuid,
  (select updated_at from public.service_visits
    where id = current_setting('test.closed_visit')::uuid),
  'completed', '', '57000000-0000-4000-8000-000000000012'),
  'completed', 'Completing the visit closes the report atomically');
select is((select count(*) from public.service_visit_report_versions
  where visit_id = current_setting('test.closed_visit')::uuid), 1::bigint,
  'One immutable version is created');
select is((select snapshot #>> '{report,data,notes}'
  from public.service_visit_report_versions), 'Se revisó la instalación',
  'Closed version keeps the saved notes');
select is((select snapshot #>> '{activities,0,description}'
  from public.service_visit_report_versions), 'Comprobación corregida',
  'Closed version includes the effective correction');
select is((select jsonb_array_length(snapshot->'activities')
  from public.service_visit_report_versions), 1,
  'Closed version excludes superseded field entries');
select throws_ok($$update public.service_visit_report_versions
  set snapshot = '{}'::jsonb$$, '42501', null,
  'Technician cannot alter the closed version');

set local request.jwt.claim.sub = '57000000-0000-4000-8000-000000000006';
select is((select count(*) from public.service_visit_report_versions),
  0::bigint, 'Unassigned technician cannot see a report');
set local request.jwt.claim.sub = '57000000-0000-4000-8000-000000000007';
select is((select count(*) from public.service_visit_report_versions),
  0::bigint, 'Another company cannot see a report');

select * from finish();
rollback;
