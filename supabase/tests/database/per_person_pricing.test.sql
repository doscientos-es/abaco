begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is(public.billing_catalog_net('standard', 1, 'month'), 3480, 'Monthly base includes one person');
select is(public.billing_catalog_net('standard', 1, 'year'), 34800, 'Annual base is 29 euros per month');
select is(public.billing_catalog_net('standard', 3, 'month'), 5080, 'Monthly additional people cost 8 euros');
select is(public.billing_catalog_net('standard', 3, 'year'), 54000, 'Annual additional people cost 96 euros');
select is(public.billing_catalog_net('standard', 0, 'year'), null::integer, 'Zero seats is invalid');
select is(public.billing_catalog_net('standard', 201, 'year'), null::integer, 'Capacity is bounded');
select is(public.billing_catalog_net('scale', 16, 'month'), 29700, 'Legacy Enterprise pricing is unchanged');

insert into auth.users (id, email) values
  ('ef000000-0000-4000-8000-000000000001', 'per-person-admin@example.test');
insert into public.tenants (id, name) values
  ('ef000000-0000-4000-8000-000000000002', 'Per-person billing test');
insert into public.memberships (tenant_id, user_id, role) values
  ('ef000000-0000-4000-8000-000000000002', 'ef000000-0000-4000-8000-000000000001', 'admin');

set local role authenticated;
set local request.jwt.claim.sub = 'ef000000-0000-4000-8000-000000000001';
select lives_ok($$select public.schedule_tenant_module('ef000000-0000-4000-8000-000000000002',
  'procurement', true, 1500, 15000)$$, 'A module can be selected before checkout');
set local role service_role;
select throws_ok($$select public.billing_manage('ef000000-0000-4000-8000-000000000002',
  'ef000000-0000-4000-8000-000000000001', 'checkout', 'standard', 'year', 3, 65340, '5678ABCD')$$,
  'P0001', 'El importe ha cambiado. Actualiza la página y confirma de nuevo.',
  'Checkout rejects a quote omitting a selected module');
select is(public.billing_manage('ef000000-0000-4000-8000-000000000002',
  'ef000000-0000-4000-8000-000000000001', 'checkout', 'standard', 'year', 3, 83490, '5678ABCD'),
  83490, 'Checkout reserves the exact annual amount including VAT and module');
select is(public.apply_billing_payment('5678ABCD', true, '0000', 'test-reference'), 'succeeded',
  'The new terms and module can be settled');
reset role;
select results_eq($$select plan, billing_seats, billing_net_cents, billing_module_net_cents
  from public.tenants where id = 'ef000000-0000-4000-8000-000000000002'$$,
  $$values ('standard'::text, 3, 54000, 15000)$$, 'Paid base, seats and module are snapshotted');
select ok(app_private.tenant_module_enabled('ef000000-0000-4000-8000-000000000002', 'procurement'),
  'The paid module is enabled');
select ok(not app_private.tenant_module_enabled('ef000000-0000-4000-8000-000000000002', 'workers'),
  'The new offer does not include other modules');

select * from finish();
rollback;