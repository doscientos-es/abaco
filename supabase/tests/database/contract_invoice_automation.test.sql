-- Run transactionally: no production invoices, notifications or emails survive this test.
begin;
set local timezone = 'UTC';
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(27);
insert into public.tenants (id, name, is_complimentary) values
  ('92000000-0000-4000-8000-000000000001', 'Invoice automation tests', true),
  ('92000000-0000-4000-8000-000000000002', 'Other automation tenant', true);
insert into auth.users (id, email) values
  ('92000000-0000-4000-8000-000000000021', 'automation-admin@example.test'),
  ('92000000-0000-4000-8000-000000000022', 'automation-worker@example.test'),
  ('92000000-0000-4000-8000-000000000023', 'automation-other@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000021', 'admin'),
  ('92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000022', 'user'),
  ('92000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000023', 'admin');
insert into public.clients (id, tenant_id, name, email) values
  ('92000000-0000-4000-8000-000000000011', '92000000-0000-4000-8000-000000000001', 'Client', 'client@example.test'),
  ('92000000-0000-4000-8000-000000000012', '92000000-0000-4000-8000-000000000001', 'No email', ''),
  ('92000000-0000-4000-8000-000000000013', '92000000-0000-4000-8000-000000000002', 'Other client', 'other@example.test');
insert into public.service_contracts (
  id, operation_id, tenant_id, client_id, title, status, starts_on, ends_on, timezone,
  price_cents, billing_frequency, source_snapshot, created_by
) select ('92000000-0000-4000-8000-00000000010' || n)::uuid, gen_random_uuid(),
  case when n = 6 then '92000000-0000-4000-8000-000000000002' else '92000000-0000-4000-8000-000000000001' end::uuid,
  case when n = 6 then '92000000-0000-4000-8000-000000000013' when n = 5 then '92000000-0000-4000-8000-000000000012' else '92000000-0000-4000-8000-000000000011' end::uuid,
  'Automation ' || n, case when n = 4 then 'paused' else 'active' end,
  current_date - 30, current_date + 30, 'UTC', 10000, 'once', '{}', '92000000-0000-4000-8000-000000000021'
from generate_series(1, 6) n;
insert into public.contract_billing_periods (
  id, tenant_id, contract_id, cycle_index, period_start_on, period_end_on, net_cents, vat_rate, pricing_status
) select ('92000000-0000-4000-8000-00000000020' || n)::uuid, tenant_id, id, 0,
  current_date - 30, current_date - 1, 10000, 21, 'priced'
from public.service_contracts cross join generate_series(1, 6) n
where id = ('92000000-0000-4000-8000-00000000010' || n)::uuid;
insert into public.invoice_contract_period_drafts (
  id, tenant_id, contract_period_id, contract_id, client_id, concept, total_cents, vat_rate, due_date
) select ('92000000-0000-4000-8000-00000000040' || n)::uuid, tenant_id,
  ('92000000-0000-4000-8000-00000000020' || n)::uuid, id, client_id, 'Automated invoice', 12100, 21,
  current_date + case when n = 2 then 1 when n = 3 then -1 else 0 end
from public.service_contracts cross join generate_series(1, 6) n
where id = ('92000000-0000-4000-8000-00000000010' || n)::uuid;
update app_private.contract_invoice_automation_settings set enabled_at = current_date;
select public.run_contract_invoice_automation();
select is((select count(*) from public.invoices where tenant_id in ('92000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000002')), 3::bigint, 'Due active contracts issue even without a recipient email');
select is((select count(*) from public.invoice_contract_period_drafts where id in ('92000000-0000-4000-8000-000000000402', '92000000-0000-4000-8000-000000000403', '92000000-0000-4000-8000-000000000404') and status = 'draft'), 3::bigint, 'Future, pre-enablement and paused drafts stay manual');
select is((select status from public.contract_invoice_deliveries where tenant_id = '92000000-0000-4000-8000-000000000001' and last_error = 'email_missing'), 'failed', 'Missing emails are explicitly reported');
select is((select count(*) from public.contract_invoice_notifications where tenant_id = '92000000-0000-4000-8000-000000000001'), 2::bigint, 'Only administrators receive notifications');
select public.run_contract_invoice_automation();
select is((select count(*) from public.invoices where tenant_id = '92000000-0000-4000-8000-000000000001'), 2::bigint, 'Repeated runs cannot duplicate invoices');
select is((select count(*) from public.contract_invoice_notifications where tenant_id = '92000000-0000-4000-8000-000000000001'), 2::bigint, 'Repeated runs cannot duplicate notifications');
-- Catch up an outage after enablement, without changing the original due date.
update app_private.contract_invoice_automation_settings set enabled_at = current_date - 2;
select public.run_contract_invoice_automation();
select is((select status from public.invoice_contract_period_drafts where id = '92000000-0000-4000-8000-000000000403'), 'issued', 'Missed scheduled days are caught up');
select is((select due_date from public.invoices where contract_period_id = '92000000-0000-4000-8000-000000000203'), current_date - 1, 'Catch-up preserves the due date');
select is((select issued_at from public.invoices where contract_period_id = '92000000-0000-4000-8000-000000000203'), current_date, 'Catch-up uses the actual issuance date');
-- Isolate worker claims within this rolled-back transaction; never dispatch real mail.
update public.contract_invoice_deliveries set next_attempt_at = 'infinity', lease_until = 'infinity'
where invoice_id not in (select issued_invoice_id from public.invoice_contract_period_drafts where id = '92000000-0000-4000-8000-000000000401');
create temporary table claimed_delivery as select * from public.claim_contract_invoice_delivery('sender@example.test');
select is((select count(*) from claimed_delivery), 1::bigint, 'Worker claims one delivery');
select is((select count(*) from public.claim_contract_invoice_delivery('sender@example.test')), 0::bigint, 'A live lease prevents a second worker from sending');
select is((select sender_address from claimed_delivery), 'sender@example.test', 'Sender is captured for stable retries');
select is(public.finish_contract_invoice_delivery((select invoice_id from claimed_delivery), gen_random_uuid(), 'retry'), false, 'Stale lease tokens cannot finish a delivery');
select is(public.finish_contract_invoice_delivery((select invoice_id from claimed_delivery), (select lease_token from claimed_delivery), 'retry', null, 'provider_503'), true, 'Transient errors can retry');
select is((select count(*) from public.claim_contract_invoice_delivery('sender@example.test')), 0::bigint, 'Retry backoff is respected');
update public.contract_invoice_deliveries set next_attempt_at = clock_timestamp() - interval '1 second' where invoice_id = (select invoice_id from claimed_delivery);
create temporary table retried_delivery as select * from public.claim_contract_invoice_delivery('changed@example.test');
select is((select sender_address from retried_delivery), 'sender@example.test', 'Retries keep the original sender');
select is(public.finish_contract_invoice_delivery((select invoice_id from retried_delivery), (select lease_token from retried_delivery), 'sent', 'test-provider-automation'), true, 'Acceptance is recorded');
select is((select count(*) from public.invoice_delivery_events where resend_email_id = 'test-provider-automation'), 1::bigint, 'Acceptance reaches existing invoice delivery history');
select ok((select email_accepted_at is not null from public.invoices where id = (select invoice_id from retried_delivery)), 'Invoice tracks accepted email');
select is((select count(*) from public.claim_contract_invoice_delivery('sender@example.test')), 0::bigint, 'Sent mail is never leased again');
set local role authenticated;
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000021';
select is((select count(*) from public.list_contract_invoice_notifications('92000000-0000-4000-8000-000000000001')), 3::bigint, 'Admin sees their own company notifications');
select public.read_contract_invoice_notification((select id from public.list_contract_invoice_notifications('92000000-0000-4000-8000-000000000001') limit 1));
select is((select count(*) from public.list_contract_invoice_notifications('92000000-0000-4000-8000-000000000001') where read_at is not null), 1::bigint, 'Read state is persisted per recipient');
select is((select count(*) from public.list_contract_invoice_notifications('92000000-0000-4000-8000-000000000002')), 0::bigint, 'Other tenant notifications are hidden');
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000022';
select is((select count(*) from public.list_contract_invoice_notifications('92000000-0000-4000-8000-000000000001')), 0::bigint, 'Workers cannot read financial notifications');
select ok(not has_function_privilege('authenticated', 'public.run_contract_invoice_automation()', 'EXECUTE'), 'Browser sessions cannot run fleet-wide issuance');
select ok(not has_function_privilege('authenticated', 'public.claim_contract_invoice_delivery(text)', 'EXECUTE'), 'Browser sessions cannot claim emails');
select ok(not has_table_privilege('authenticated', 'public.contract_invoice_deliveries', 'SELECT'), 'Fiscal queue payloads are private');
select * from finish();
rollback;
