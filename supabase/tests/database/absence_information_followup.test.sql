begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.tenants (id, name) values
  ('84000000-0000-4000-8000-000000000001', 'Seguimiento ausencias');
insert into auth.users (id, email, raw_user_meta_data) values
  ('84000000-0000-4000-8000-000000000002', 'admin-followup@example.test', '{"full_name":"Admin"}'),
  ('84000000-0000-4000-8000-000000000003', 'worker-followup@example.test', '{"full_name":"Trabajador"}'),
  ('84000000-0000-4000-8000-000000000004', 'other-followup@example.test', '{"full_name":"Otra persona"}');
insert into public.memberships (tenant_id, user_id, role) values
  ('84000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000002', 'admin'),
  ('84000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000003', 'user'),
  ('84000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000004', 'user');

set local role authenticated;
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000003';
select set_config('test.absence_followup', public.submit_absence_request(
  '84000000-0000-4000-8000-000000000001', 'sick_leave', current_date, null, '')::text, true);
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000002';
select public.request_absence_information('84000000-0000-4000-8000-000000000001',
  current_setting('test.absence_followup')::uuid, 'Confirma la fecha de inicio prevista.');
select is((select status from public.absence_requests
  where id = current_setting('test.absence_followup')::uuid), 'needs_info',
  'Admin can request additional information');
select is((select decision from public.vacation_decision_notifications
  where request_id = current_setting('test.absence_followup')::uuid), 'needs_info',
  'Worker is notified when information is requested');
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000004';
select throws_ok($$select public.respond_absence_information(
  '84000000-0000-4000-8000-000000000001', current_setting('test.absence_followup')::uuid,
  'La fecha es mañana.')$$,
  'P0409', 'La solicitud no está esperando información tuya',
  'Another worker cannot respond to the request');
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000003';
select public.respond_absence_information('84000000-0000-4000-8000-000000000001',
  current_setting('test.absence_followup')::uuid, 'La fecha es mañana.');
select is((select status from public.absence_requests
  where id = current_setting('test.absence_followup')::uuid), 'pending',
  'Worker response returns request to admin review');
select is((select requester_response_comment from public.absence_requests
  where id = current_setting('test.absence_followup')::uuid), 'La fecha es mañana.',
  'Worker response is visible for review');
select ok((select requester_responded_at is not null from public.absence_requests
  where id = current_setting('test.absence_followup')::uuid),
  'Worker response timestamp is recorded');
select throws_ok($$select public.respond_absence_information(
  '84000000-0000-4000-8000-000000000001', current_setting('test.absence_followup')::uuid, '')$$,
  '22023', 'Escribe la información solicitada', 'Empty responses are rejected');
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000002';
select public.decide_vacation_request('84000000-0000-4000-8000-000000000001',
  current_setting('test.absence_followup')::uuid, 'approved', 'Revisada');
select is((select status from public.absence_requests
  where id = current_setting('test.absence_followup')::uuid), 'approved',
  'Admin can decide after receiving a response');

select * from finish();
rollback;
