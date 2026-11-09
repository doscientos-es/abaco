begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

insert into public.tenants (id, name) values
  ('67000000-0000-4000-8000-000000000001', 'Empresa vacaciones'),
  ('67000000-0000-4000-8000-000000000002', 'Otra empresa');
insert into auth.users (id, email, raw_user_meta_data) values
  ('67000000-0000-4000-8000-000000000003', 'owner-vac@example.test', '{"full_name":"Olga Propietaria"}'),
  ('67000000-0000-4000-8000-000000000004', 'admin-vac@example.test', '{"full_name":"Adrián Administración"}'),
  ('67000000-0000-4000-8000-000000000005', 'tech-vac@example.test', '{"full_name":"Toni Técnico"}'),
  ('67000000-0000-4000-8000-000000000006', 'tech2-vac@example.test', '{"full_name":"Tere Técnica"}'),
  ('67000000-0000-4000-8000-000000000007', 'editor-vac@example.test', '{"full_name":"Eva Editora"}'),
  ('67000000-0000-4000-8000-000000000008', 'foreign-vac@example.test', '{"full_name":"Félix Ajeno"}');
insert into public.memberships (tenant_id, user_id, role) values
  ('67000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000003', 'owner'),
  ('67000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000004', 'admin'),
  ('67000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000005', 'technician'),
  ('67000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000006', 'technician'),
  ('67000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000007', 'editor'),
  ('67000000-0000-4000-8000-000000000002', '67000000-0000-4000-8000-000000000008', 'owner');

set local role authenticated;
set local request.jwt.claim.sub = '67000000-0000-4000-8000-000000000005';
select set_config('test.vacation_one', public.submit_vacation_request(
  '67000000-0000-4000-8000-000000000001', '2026-12-24', '2026-12-26', 'Viaje familiar'
)::text, true);
select ok(current_setting('test.vacation_one')::uuid is not null,
  'Technician can submit a vacation request');
select is((select count(*) from public.vacation_requests), 1::bigint,
  'Technician can read their own request');
select is((select requester_id from public.vacation_requests
  where id = current_setting('test.vacation_one')::uuid),
  '67000000-0000-4000-8000-000000000005'::uuid,
  'Requester identity comes from the authenticated session');
select is((select requester_name from public.vacation_requests
  where id = current_setting('test.vacation_one')::uuid), 'Toni Técnico',
  'Requester display name is recorded from the trusted profile');
select is((select start_date from public.vacation_requests
  where id = current_setting('test.vacation_one')::uuid), '2026-12-24'::date,
  'Start date is stored as a calendar date');
select is((select end_date from public.vacation_requests
  where id = current_setting('test.vacation_one')::uuid), '2026-12-26'::date,
  'End date is included in the requested period');
select is((select status from public.vacation_requests
  where id = current_setting('test.vacation_one')::uuid), 'pending',
  'New requests do not change planning and start pending');
select throws_ok(
  $$select public.submit_vacation_request(
    '67000000-0000-4000-8000-000000000001', '2026-12-26', '2026-12-24', '')$$,
  '22023', 'Datos de vacaciones inválidos', 'Reversed date ranges are rejected');
select throws_ok(
  $$select public.submit_vacation_request(
    '67000000-0000-4000-8000-000000000001', '2026-12-24', '2026-12-24', repeat('x', 1001))$$,
  '22023', 'Datos de vacaciones inválidos', 'Oversized request comments are rejected');
select throws_ok(
  $$insert into public.vacation_requests (tenant_id, requester_id, requester_name, start_date, end_date)
    values ('67000000-0000-4000-8000-000000000001',
      '67000000-0000-4000-8000-000000000005', 'Toni Técnico', current_date, current_date)$$,
  '42501', null, 'Direct table writes are denied');

set local request.jwt.claim.sub = '67000000-0000-4000-8000-000000000006';
select is((select count(*) from public.vacation_requests), 0::bigint,
  'A technician cannot read a colleague request');
select set_config('test.vacation_two', public.submit_vacation_request(
  '67000000-0000-4000-8000-000000000001', '2027-01-04', '2027-01-04', ''
)::text, true);
select is((select count(*) from public.vacation_requests), 1::bigint,
  'Second technician sees only their own request');
select throws_ok(
  $$select public.decide_vacation_request(
    '67000000-0000-4000-8000-000000000001',
    current_setting('test.vacation_one')::uuid, 'approved', '')$$,
  '42501', 'No tienes permiso para gestionar vacaciones',
  'Technician cannot decide vacation requests');

set local request.jwt.claim.sub = '67000000-0000-4000-8000-000000000007';
select throws_ok(
  $$select public.submit_vacation_request(
    '67000000-0000-4000-8000-000000000001', '2027-01-04', '2027-01-04', '')$$,
  '42501', 'No tienes permiso para solicitar vacaciones', 'Editor cannot submit as a technician');

set local request.jwt.claim.sub = '67000000-0000-4000-8000-000000000008';
select is((select count(*) from public.vacation_requests), 0::bigint,
  'Another company cannot read vacation requests');
select throws_ok(
  $$select public.decide_vacation_request(
    '67000000-0000-4000-8000-000000000001',
    current_setting('test.vacation_one')::uuid, 'approved', '')$$,
  '42501', 'No tienes permiso para gestionar vacaciones',
  'Another company cannot decide a request');

set local request.jwt.claim.sub = '67000000-0000-4000-8000-000000000003';
select is((select count(*) from public.vacation_requests), 2::bigint,
  'Owner can review company request history');
select is(public.decide_vacation_request(
  '67000000-0000-4000-8000-000000000001',
  current_setting('test.vacation_one')::uuid, 'approved', 'Cobertura confirmada'
), current_setting('test.vacation_one')::uuid,
  'Owner can approve a pending request');
select is((select status from public.vacation_requests
  where id = current_setting('test.vacation_one')::uuid), 'approved',
  'Approval is visible in request history');
select is((select decided_by from public.vacation_requests
  where id = current_setting('test.vacation_one')::uuid),
  '67000000-0000-4000-8000-000000000003'::uuid,
  'Decision author is recorded');
select is((select decided_by_name from public.vacation_requests
  where id = current_setting('test.vacation_one')::uuid), 'Olga Propietaria',
  'Decision author display name is captured');
select ok((select decided_at is not null from public.vacation_requests
  where id = current_setting('test.vacation_one')::uuid), 'Decision timestamp is recorded');
select is((select decision_comment from public.vacation_requests
  where id = current_setting('test.vacation_one')::uuid), 'Cobertura confirmada',
  'Decision comment is retained in history');
select throws_ok(
  $$select public.decide_vacation_request(
    '67000000-0000-4000-8000-000000000001',
    current_setting('test.vacation_one')::uuid, 'rejected', '')$$,
  'P0409', 'La solicitud ya tiene una decisión', 'A decided request cannot be decided again');
select throws_ok(
  $$select public.decide_vacation_request(
    '67000000-0000-4000-8000-000000000001',
    current_setting('test.vacation_two')::uuid, 'pending', '')$$,
  '22023', 'Decisión de vacaciones inválida', 'Only approval or rejection are valid decisions');
select throws_ok(
  $$update public.vacation_requests set status = 'rejected'
    where id = current_setting('test.vacation_one')::uuid$$,
  '42501', null, 'Even office users cannot bypass the decision command');

set local request.jwt.claim.sub = '67000000-0000-4000-8000-000000000004';
select is(public.decide_vacation_request(
  '67000000-0000-4000-8000-000000000001',
  current_setting('test.vacation_two')::uuid, 'rejected', 'Revisar otras fechas'
), current_setting('test.vacation_two')::uuid,
  'Admin can reject a pending request');
select is((select status from public.vacation_requests
  where id = current_setting('test.vacation_two')::uuid), 'rejected',
  'Rejection is visible in request history');
select is((select decided_by from public.vacation_requests
  where id = current_setting('test.vacation_two')::uuid),
  '67000000-0000-4000-8000-000000000004'::uuid,
  'Admin decision author is recorded');
select is((select decision_comment from public.vacation_requests
  where id = current_setting('test.vacation_two')::uuid), 'Revisar otras fechas',
  'Rejection comment is retained');

set local request.jwt.claim.sub = '67000000-0000-4000-8000-000000000005';
select is((select status from public.vacation_requests
  where id = current_setting('test.vacation_one')::uuid), 'approved',
  'Worker can consult their decision');
select is((select decided_by_name from public.vacation_requests
  where id = current_setting('test.vacation_one')::uuid), 'Olga Propietaria',
  'Worker can identify who decided their request');
select is((select count(*) from public.vacation_requests), 1::bigint,
  'Worker history remains limited to their own requests');
select set_config('test.vacation_pending', public.submit_vacation_request(
  '67000000-0000-4000-8000-000000000001', '2027-02-01', '2027-02-02', ''
)::text, true);
select ok(current_setting('test.vacation_pending')::uuid is not null,
  'Technician can submit a new request before the company becomes inactive');

set local role postgres;
update public.tenants set subscription_status = 'canceled'
where id = '67000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = '67000000-0000-4000-8000-000000000003';
select throws_ok(
  $$select public.decide_vacation_request(
    '67000000-0000-4000-8000-000000000001',
    current_setting('test.vacation_pending')::uuid, 'approved', '')$$,
  'P0402', 'La empresa no puede gestionar vacaciones',
  'Inactive companies cannot approve vacation requests');
set local request.jwt.claim.sub = '67000000-0000-4000-8000-000000000005';
select throws_ok(
  $$select public.submit_vacation_request(
    '67000000-0000-4000-8000-000000000001', '2027-03-01', '2027-03-02', '')$$,
  'P0402', 'La empresa no puede gestionar vacaciones',
  'Inactive companies cannot submit vacation requests');

select * from finish();
rollback;