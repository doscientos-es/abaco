begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('ad000000-0000-4000-8000-000000000001', 'platform@example.test'),
  ('ad000000-0000-4000-8000-000000000002', 'tenant-admin@example.test');
insert into public.tenants (id, name) values
  ('ad000000-0000-4000-8000-000000000011', 'Empresa Uno'),
  ('ad000000-0000-4000-8000-000000000012', 'Empresa Dos');
insert into public.memberships (tenant_id, user_id, role) values
  ('ad000000-0000-4000-8000-000000000011', 'ad000000-0000-4000-8000-000000000002', 'admin');
insert into public.platform_superadmins (user_id)
values ('ad000000-0000-4000-8000-000000000001');
insert into public.billing_payments (tenant_id, merchant_order, kind, plan, period, amount_cents, status)
values ('ad000000-0000-4000-8000-000000000012', '1234WXYZ', 'first', 'solo', 'month', 2420, 'failed');

set local role authenticated;
set local request.jwt.claim.sub = 'ad000000-0000-4000-8000-000000000002';
select is(public.is_platform_superadmin(), false, 'Tenant admin is not a platform superadmin');
select throws_ok($$select * from public.superadmin_companies()$$, '42501', 'No autorizado',
  'Tenant admins cannot list all companies');
select throws_ok($$select * from public.superadmin_payments('ad000000-0000-4000-8000-000000000012')$$,
  '42501', 'No autorizado', 'Tenant admins cannot read another company payment history');
select throws_ok($$insert into public.platform_superadmins (user_id)
  values ('ad000000-0000-4000-8000-000000000002')$$, '42501', null,
  'Authenticated users cannot grant themselves platform access');
select is((select count(*) from public.tenants where id = 'ad000000-0000-4000-8000-000000000012'),
  0::bigint, 'Ordinary tenant isolation remains in force');

set local request.jwt.claim.sub = 'ad000000-0000-4000-8000-000000000001';
select is(public.is_platform_superadmin(), true, 'Explicitly granted user is a platform superadmin');
select is((select count(*) from public.superadmin_companies('Empresa')),
  2::bigint, 'Platform superadmin can search companies');
select is((select member_count from public.superadmin_companies('Uno')),
  1::bigint, 'Company results include the real member count');
select is((select amount_cents from public.superadmin_payments('ad000000-0000-4000-8000-000000000012')),
  2420, 'Platform superadmin can see real failed payment amounts');
select unlike(pg_get_function_result('public.superadmin_payments(uuid,integer,text)'::regprocedure),
  '%merchant_order%', 'Payment results do not expose merchant references');

reset role;
delete from public.platform_superadmins where user_id = 'ad000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.is_platform_superadmin(), false, 'Revocation takes effect immediately');

select * from finish();
rollback;