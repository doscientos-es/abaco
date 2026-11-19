begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('ad120000-0000-4000-8000-000000000001', 'tenant-admin@example.test'),
  ('ad120000-0000-4000-8000-000000000002', 'platform-admin@example.test');
insert into public.platform_superadmins (user_id) values ('ad120000-0000-4000-8000-000000000002');
insert into public.tenants (id, name) values
  ('ad120000-0000-4000-8000-000000000011', 'Taller Prueba AD12'),
  ('ad120000-0000-4000-8000-000000000012', 'Servicios Prueba AD12');
insert into public.memberships (tenant_id, user_id, role) values
  ('ad120000-0000-4000-8000-000000000011', 'ad120000-0000-4000-8000-000000000001', 'admin');

insert into public.billing_payments
  (tenant_id, merchant_order, kind, plan, period, amount_cents, status, invoice_number, invoice_status, settled_at)
values
  ('ad120000-0000-4000-8000-000000000011', '9900AD120001', 'first', 'team', 'month', 4114, 'succeeded', 'TEST-AD12-01', 'sent', now()),
  ('ad120000-0000-4000-8000-000000000012', '9900AD120002', 'first', 'team', 'month', 4114, 'succeeded', null, 'pending', now() - interval '1 day'),
  ('ad120000-0000-4000-8000-000000000012', '9900AD120003', 'first', 'team', 'month', 4114, 'succeeded', null, null, now()),
  ('ad120000-0000-4000-8000-000000000012', '9900AD120004', 'first', 'team', 'month', 4114, 'failed', null, null, now());

set local role anon;
select is((select name from public.billing_plan_display where plan = 'team'), 'Equipo', 'Anonymous customers can read plan names');
select throws_ok($$select public.superadmin_subscription_invoices('', 0, null)$$,
  '42501', null, 'Anonymous users cannot call invoice search');

set local role authenticated;
set local request.jwt.claim.sub = 'ad120000-0000-4000-8000-000000000001';
select throws_ok($$select public.superadmin_subscription_invoices('AD12', 0, null)$$,
  '42501', null, 'Even a tenant admin cannot search platform invoices');
select throws_ok($$select public.superadmin_update_billing_plan('team', 1, 'No', 'No', 'No', '{"5":3500}')$$,
  '42501', null, 'A tenant admin cannot publish prices');

set local request.jwt.claim.sub = 'ad120000-0000-4000-8000-000000000002';
select results_eq($$select merchant_order from public.superadmin_subscription_invoices('prueba ad12', 0, null)$$,
  $$values ('9900AD120001'::text), ('9900AD120002'::text)$$, 'Searches company names across tenants and excludes charges without invoice requests');
select is((select merchant_order from public.superadmin_subscription_invoices('test-ad12-01', 0, 'issued')),
  '9900AD120001', 'Searches invoice numbers and filters numbered invoices');
select is((select invoice_status from public.superadmin_subscription_invoices('9900ad120002', 0, 'in_progress')),
  'pending', 'Searches bank references and filters invoices without a number');
select is((select merchant_order from public.superadmin_subscription_invoices('prueba ad12', 1, null)),
  '9900AD120002', 'An offset advances past the most recent payment');
select throws_ok($$select public.superadmin_update_billing_plan('team', 1, 'Equipo+', 'Cuadrillas', 'Coordina el equipo', '{"50":3500}')$$,
  '22023', null, 'An invalid tier cannot publish');
select lives_ok($$select public.superadmin_update_billing_plan('team', 1, 'Equipo+', 'Cuadrillas', 'Coordina el equipo', '{"5":3500}')$$,
  'Platform staff can publish the copy and prices together');
select throws_ok($$select public.superadmin_update_billing_plan('team', 1, 'Equipo', 'Cuadrillas', 'Coordina el equipo', '{"5":3400}')$$,
  '40001', null, 'A stale editor cannot overwrite a published update');

set local role anon;
select results_eq($$select d.name, c.monthly_cents, c.yearly_cents from public.billing_catalog c
  join public.billing_plan_display d using (plan) where c.plan = 'team'$$,
  $$values ('Equipo+'::text, 3500, 35000)$$, 'Customers can read the published plan copy and both prices');

reset role;
select is((select amount_cents from public.billing_payments where merchant_order = '9900AD120001'),
  4114, 'Publishing a price never changes a historical charge');
select * from finish();
rollback;