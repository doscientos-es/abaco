begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.tenants(id, name) values
  ('86000000-0000-4000-8000-000000000001', 'Empresa horarios'),
  ('86000000-0000-4000-8000-000000000002', 'Otra empresa');
insert into auth.users(id, email) values
  ('86000000-0000-4000-8000-000000000003', 'schedule-admin@example.test'),
  ('86000000-0000-4000-8000-000000000004', 'schedule-ana@example.test'),
  ('86000000-0000-4000-8000-000000000005', 'schedule-bea@example.test'),
  ('86000000-0000-4000-8000-000000000006', 'schedule-other@example.test');
insert into public.memberships(tenant_id, user_id, role) values
  ('86000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000003', 'admin'),
  ('86000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000004', 'user'),
  ('86000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000005', 'technician'),
  ('86000000-0000-4000-8000-000000000002', '86000000-0000-4000-8000-000000000006', 'admin');
insert into public.staff_functions(id, tenant_id, name) values
  ('86000000-0000-4000-8000-000000000007', '86000000-0000-4000-8000-000000000001', 'Electricidad'),
  ('86000000-0000-4000-8000-000000000008', '86000000-0000-4000-8000-000000000001', 'Fontanería');

set local role authenticated;
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000003';
select set_config('test.schedule_version', public.save_staff_schedule(
  '86000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000004', null,
  '[{"weekday":1,"start":540,"end":1020}]'::jsonb,
  array['86000000-0000-4000-8000-000000000007'::uuid])::text, true);
select public.save_staff_schedule(
  '86000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000005', null,
  '[{"weekday":1,"start":600,"end":900}]'::jsonb,
  array['86000000-0000-4000-8000-000000000008'::uuid]);
select is((select count(*) from public.staff_schedules), 2::bigint, 'Admin sees the team schedules');
select throws_ok($$select public.save_staff_schedule(
  '86000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000004', null,
  '[]'::jsonb, array[]::uuid[])$$, 'P0409', 'El horario cambió; recarga antes de guardar',
  'A stale editor cannot overwrite the schedule');

set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000004';
select is((select count(*) from public.staff_schedules), 1::bigint, 'Worker sees only their schedule');
select is((select count(*) from public.staff_function_assignments), 1::bigint, 'Worker sees only their assignments');
select is((select name from public.staff_functions), 'Electricidad', 'Worker sees only their assigned function');
select throws_ok($$select public.save_staff_schedule(
  '86000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000004',
  current_setting('test.schedule_version')::timestamptz, '[]'::jsonb, array[]::uuid[])$$,
  '42501', 'No tienes permiso para gestionar horarios', 'Worker cannot edit their schedule');

set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000005';
select is((select count(*) from public.staff_schedules), 1::bigint, 'Legacy technician sees their schedule');
select is((select name from public.staff_functions), 'Fontanería', 'Legacy technician sees their function');

set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000006';
select is((select count(*) from public.staff_schedules), 0::bigint, 'Another company cannot see schedules');
select is((select count(*) from public.staff_function_assignments), 0::bigint, 'Another company cannot see assignments');
select is((select count(*) from public.staff_functions), 0::bigint, 'Another company cannot see functions');

select * from finish();
rollback;
