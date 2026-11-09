begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.tenants (id, name, plan, trial_ends_at) values
  ('81000000-0000-4000-8000-000000000001', 'Cortesía', 'business', now() - interval '1 day'),
  ('81000000-0000-4000-8000-000000000002', 'Normal', 'business', now() - interval '1 day');
insert into auth.users (id, email) values
  ('81000000-0000-4000-8000-000000000003', 'courtesy-admin@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000003', 'admin');

select is(public.tenant_can_write('81000000-0000-4000-8000-000000000001'), false,
  'An expired trial cannot write');
set local role authenticated;
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000003';
select throws_ok($$update public.tenants set is_complimentary = true
  where id = '81000000-0000-4000-8000-000000000001'$$,
  'P0001', 'El acceso de cortesía solo lo gestiona Ábaco',
  'A tenant admin cannot grant courtesy');
reset role;

insert into public.billing_payments (tenant_id, merchant_order, kind, plan, period, amount_cents)
values ('81000000-0000-4000-8000-000000000001', '1234ABCD', 'first', 'business', 'month', 100);
select throws_ok($$update public.tenants set is_complimentary = true
  where id = '81000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Hay pagos pendientes de verificar', 'Pending bank operations block courtesy');
update public.billing_payments set status = 'failed' where merchant_order = '1234ABCD';
update public.tenants set is_complimentary = true
where id = '81000000-0000-4000-8000-000000000001';
select is(public.tenant_can_write('81000000-0000-4000-8000-000000000001'), true,
  'Courtesy enables writes after trial expiry');
select is(public.tenant_can_write('81000000-0000-4000-8000-000000000002'), false,
  'Other expired tenants remain read-only');
select throws_ok($$insert into public.billing_payments
  (tenant_id, merchant_order, kind, plan, period, amount_cents)
  values ('81000000-0000-4000-8000-000000000001', '1234EFGH', 'renewal', 'business', 'month', 100)$$,
  'P0001', 'La empresa tiene acceso de cortesía', 'Courtesy rejects new payment attempts');

insert into public.billing_methods (tenant_id, redsys_reference)
values ('81000000-0000-4000-8000-000000000001', 'test-reference'),
       ('81000000-0000-4000-8000-000000000002', 'test-reference');
update public.tenants set subscription_status = 'active', billing_interval = 'month',
  current_period_end = now() - interval '1 day'
where id in ('81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002');
select is((select count(*) from public.billing_due_renewals()
  where tenant_id = '81000000-0000-4000-8000-000000000001'), 0::bigint,
  'Courtesy is excluded from automatic renewals');
select is((select count(*) from public.billing_due_renewals()
  where tenant_id = '81000000-0000-4000-8000-000000000002'), 1::bigint,
  'Other due subscriptions are still selected');
update public.tenants set cancel_at_period_end = true
where id in ('81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002');
select public.expire_subscriptions();
select is((select subscription_status from public.tenants
  where id = '81000000-0000-4000-8000-000000000001'), 'active', 'Courtesy is not expired');
select is((select subscription_status from public.tenants
  where id = '81000000-0000-4000-8000-000000000002'), 'canceled', 'Other subscriptions still expire');

select * from finish();
rollback;