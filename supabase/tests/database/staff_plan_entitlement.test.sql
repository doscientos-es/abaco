begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.tenants(id, name) values ('ea000000-0000-4000-8000-000000000001', 'Staff plan test');
insert into auth.users(id, email) values
  ('ea000000-0000-4000-8000-000000000002', 'staff-plan-admin@example.test'),
  ('ea000000-0000-4000-8000-000000000003', 'staff-plan-outsider@example.test');
insert into public.memberships(tenant_id, user_id, role) values
  ('ea000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000002', 'admin');
insert into public.staff_functions(id, tenant_id, name) values
  ('ea000000-0000-4000-8000-000000000004', 'ea000000-0000-4000-8000-000000000001', 'Función');

set local role authenticated;
set local request.jwt.claim.sub = 'ea000000-0000-4000-8000-000000000002';
select ok(public.can_use_staff('ea000000-0000-4000-8000-000000000001'), 'Trial includes staff');
select is((select count(*) from public.staff_functions), 1::bigint, 'Trial can read staff functions');
reset role;
update public.tenants set plan = 'solo', next_plan = 'team' where id = 'ea000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(not public.can_use_staff('ea000000-0000-4000-8000-000000000001'), 'Solo excludes staff even with an upgrade scheduled');
select is((select count(*) from public.staff_functions), 0::bigint, 'Solo cannot read staff functions');
select throws_ok($$select public.save_staff_schedule('ea000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000002', null, '[]'::jsonb, array[]::uuid[])$$,
  '42501', 'El módulo de trabajadores requiere el plan Equipo o superior', 'Solo cannot bypass the module via RPC');
reset role;
update public.tenants set plan = 'team', next_plan = 'solo' where id = 'ea000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(public.can_use_staff('ea000000-0000-4000-8000-000000000001'), 'Team retains access until a scheduled downgrade takes effect');
select is((select count(*) from public.staff_functions), 1::bigint, 'Existing data remains available after upgrading');
reset role;
update public.tenants set plan = 'business' where id = 'ea000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(public.can_use_staff('ea000000-0000-4000-8000-000000000001'), 'Business includes staff');
reset role;
update public.tenants set plan = 'scale' where id = 'ea000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(public.can_use_staff('ea000000-0000-4000-8000-000000000001'), 'Scale includes staff');
set local request.jwt.claim.sub = 'ea000000-0000-4000-8000-000000000003';
select ok(not public.can_use_staff('ea000000-0000-4000-8000-000000000001'), 'Non-members cannot query the entitlement');
select * from finish();
rollback;