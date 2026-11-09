begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.tenants (id, name) values ('82000000-0000-4000-8000-000000000001', 'Avisos');
insert into auth.users (id, email, raw_user_meta_data) values
  ('82000000-0000-4000-8000-000000000002', 'notice-admin@example.test', '{"full_name":"Admin"}'),
  ('82000000-0000-4000-8000-000000000003', 'notice-user@example.test', '{"full_name":"Usuario"}'),
  ('82000000-0000-4000-8000-000000000004', 'notice-other@example.test', '{"full_name":"Otro"}');
insert into public.memberships (tenant_id, user_id, role) values
  ('82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000002', 'admin'),
  ('82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000003', 'user'),
  ('82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000004', 'user');

set local role authenticated;
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000003';
select set_config('test.notice_request', public.submit_vacation_request(
  '82000000-0000-4000-8000-000000000001', current_date, current_date, '')::text, true);
select is((select count(*) from public.vacation_decision_notifications), 0::bigint,
  'A pending request creates no decision notification');
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000002';
select public.decide_vacation_request('82000000-0000-4000-8000-000000000001',
  current_setting('test.notice_request')::uuid, 'approved', '');
select is((select count(*) from public.vacation_decision_notifications), 0::bigint,
  'The administrator cannot see the user notification');
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000003';
select is((select count(*) from public.vacation_decision_notifications), 1::bigint,
  'The requester sees exactly one notification');
select is((select decision from public.vacation_decision_notifications), 'approved',
  'The notification contains the actual decision');
select is((select request_id from public.vacation_decision_notifications),
  current_setting('test.notice_request')::uuid, 'The notification links to the request');
select set_config('test.notice_id', (select id::text from public.vacation_decision_notifications), true);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000004';
select is((select count(*) from public.vacation_decision_notifications), 0::bigint,
  'Another worker cannot read the notification');
select is(public.read_vacation_decision_notification(current_setting('test.notice_id')::uuid), false,
  'Another worker cannot mark it read');
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000003';
select is(public.read_vacation_decision_notification(current_setting('test.notice_id')::uuid), true,
  'The recipient can mark it read');
select ok((select read_at is not null from public.vacation_decision_notifications),
  'The read timestamp is recorded');
select * from finish();
rollback;