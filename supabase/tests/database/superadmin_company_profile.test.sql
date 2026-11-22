begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('ac000000-0000-4000-8000-000000000001', 'profile-platform@example.test'),
  ('ac000000-0000-4000-8000-000000000002', 'profile-admin@example.test');
insert into public.tenants (id, name) values
  ('ac000000-0000-4000-8000-000000000011', 'Empresa inicial');
insert into public.memberships (tenant_id, user_id, role) values
  ('ac000000-0000-4000-8000-000000000011', 'ac000000-0000-4000-8000-000000000002', 'admin');
insert into public.platform_superadmins (user_id) values ('ac000000-0000-4000-8000-000000000001');

set local role authenticated;
set local request.jwt.claim.sub = 'ac000000-0000-4000-8000-000000000002';
select throws_ok($$select public.superadmin_company_profile('ac000000-0000-4000-8000-000000000011')$$,
  '42501', 'No autorizado', 'Tenant admins cannot read platform profiles');
select throws_ok($$select public.superadmin_update_company_profile('ac000000-0000-4000-8000-000000000011', null, '{}')$$,
  '42501', 'No autorizado', 'Tenant admins cannot update platform profiles');
select throws_ok($$select * from public.platform_company_profile_log$$,
  '42501', null, 'Authenticated users cannot read the audit table directly');

set local request.jwt.claim.sub = 'ac000000-0000-4000-8000-000000000001';
select is(public.superadmin_company_profile('ac000000-0000-4000-8000-000000000011')->>'name',
  'Empresa inicial', 'Superadmin can read a profile');
select ok(not (public.superadmin_company_profile('ac000000-0000-4000-8000-000000000011') ? 'iban'),
  'Bank details are not exposed');
select throws_ok($$select public.superadmin_update_company_profile('ac000000-0000-4000-8000-000000000011', null, '{"name":"X"}')$$,
  '22023', null, 'Incomplete profiles are rejected');
select throws_ok($$select public.superadmin_update_company_profile('ac000000-0000-4000-8000-000000000011', null,
  '{"name":"X","legal_name":"","tax_id":"","email":"bad","phone":"","address":"","postal_code":"","city":"","website":""}')$$,
  '22023', null, 'Invalid emails are rejected');
select throws_ok($$select public.superadmin_update_company_profile('ac000000-0000-4000-8000-000000000011', null,
  '{"name":"X","legal_name":"","tax_id":"","email":"","phone":"","address":"","postal_code":"","city":"","website":"","plan":"standard"}')$$,
  '22023', null, 'Billing fields cannot be passed through the profile');
select throws_ok($$select public.superadmin_update_company_profile('ac000000-0000-4000-8000-000000000011', null,
  '{"name":"X","legal_name":"","tax_id":"","email":"","phone":"","address":"","postal_code":"","city":"","website":""}')$$,
  '40001', null, 'A stale version cannot overwrite changes');
select lives_ok($$select public.superadmin_update_company_profile('ac000000-0000-4000-8000-000000000011',
  (public.superadmin_company_profile('ac000000-0000-4000-8000-000000000011')->>'updated_at')::timestamptz,
  '{"name":" Empresa nueva ","legal_name":"","tax_id":"","email":"hola@example.test","phone":"","address":"","postal_code":"","city":"","website":""}')$$,
  'Superadmin can save a profile with its current version');
select is(public.superadmin_company_profile('ac000000-0000-4000-8000-000000000011')->>'name',
  'Empresa nueva', 'Names are trimmed on save');
reset role;
select is((select previous_profile->>'name' from public.platform_company_profile_log
  where tenant_id = 'ac000000-0000-4000-8000-000000000011'), 'Empresa inicial', 'Changes are audited');
select * from finish();
rollback;