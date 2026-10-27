begin;
set local timezone = 'UTC';
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.tenants (id, name) values
  ('77000000-0000-4000-8000-000000000001', 'Empresa cuotas automáticas');
insert into public.clients (id, tenant_id, name) values
  ('77000000-0000-4000-8000-000000000002',
   '77000000-0000-4000-8000-000000000001', 'Cliente');
insert into public.service_locations (
  id, tenant_id, client_id, name, address, timezone
) values (
  '77000000-0000-4000-8000-000000000003',
  '77000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000002',
  'Piscina', 'Calle Uno 1', 'UTC'
);
insert into auth.users (id, email) values
  ('77000000-0000-4000-8000-000000000004', 'owner-auto-billing@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('77000000-0000-4000-8000-000000000001',
   '77000000-0000-4000-8000-000000000004', 'owner');

set local role authenticated;
set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000004';
select set_config('test.auto_contract', public.create_manual_service_contract(
  '77000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000002',
  '77000000-0000-4000-8000-000000000003', null,
  'Contrato con cuota',
  (date_trunc('month', current_date)::date - interval '2 months')::date,
  null, 10000, 'monthly', null, '[]'::jsonb, '{}'::jsonb,
  '77000000-0000-4000-8000-000000000005'
)::text, true);
select public.add_contract_visit_rule(
  '77000000-0000-4000-8000-000000000001',
  current_setting('test.auto_contract')::uuid,
  (select updated_at from public.service_contracts
   where id = current_setting('test.auto_contract')::uuid),
  'high', array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[],
  1::smallint, 1::smallint, '09:00'::time, 60::smallint,
  'Revisión', '77000000-0000-4000-8000-000000000006'
);
select public.transition_service_contract(
  '77000000-0000-4000-8000-000000000001',
  current_setting('test.auto_contract')::uuid,
  (select updated_at from public.service_contracts
   where id = current_setting('test.auto_contract')::uuid),
  'active', '', '77000000-0000-4000-8000-000000000007'
);
select set_config('test.invalid_contract', public.create_manual_service_contract(
  '77000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000002',
  '77000000-0000-4000-8000-000000000003', null,
  'Contrato sin precio',
  (date_trunc('month', current_date)::date - interval '2 months')::date,
  null, 0, 'monthly', null, '[]'::jsonb, '{}'::jsonb,
  '77000000-0000-4000-8000-000000000008'
)::text, true);
select public.add_contract_visit_rule(
  '77000000-0000-4000-8000-000000000001',
  current_setting('test.invalid_contract')::uuid,
  (select updated_at from public.service_contracts
   where id = current_setting('test.invalid_contract')::uuid),
  'high', array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[],
  2::smallint, 1::smallint, '09:00'::time, 60::smallint,
  'Revisión', '77000000-0000-4000-8000-000000000009'
);
select public.transition_service_contract(
  '77000000-0000-4000-8000-000000000001',
  current_setting('test.invalid_contract')::uuid,
  (select updated_at from public.service_contracts
   where id = current_setting('test.invalid_contract')::uuid),
  'active', '', '77000000-0000-4000-8000-000000000010'
);

set local role postgres;
select is(has_function_privilege(
  'authenticated', 'public.run_contract_billing_generation()', 'EXECUTE'
), false, 'An ordinary browser session cannot run the fleet-wide job');
select is((select count(*) from cron.job
  where jobname = 'contract-billing-drafts'), 1::bigint,
  'One daily billing preparation job is scheduled');
insert into public.service_contract_events (
  operation_id, tenant_id, contract_id, kind, payload, actor_id, occurred_at
) values (
  '77000000-0000-4000-8000-000000000011',
  '77000000-0000-4000-8000-000000000001',
  current_setting('test.auto_contract')::uuid,
  'status_changed', '{"from":"draft","to":"active"}'::jsonb,
  '77000000-0000-4000-8000-000000000004',
  (date_trunc('month', current_date)::date - interval '2 months')::timestamptz
);
select set_config('test.auto_run', public.run_contract_billing_generation()::text, true);
select is((current_setting('test.auto_run')::jsonb->>'periods')::integer, 2,
  'The daily job creates completed cycles for a valid contract');
select is((current_setting('test.auto_run')::jsonb->>'drafts')::integer, 2,
  'The daily job prepares reviewable drafts');
select is((current_setting('test.auto_run')::jsonb->>'errors')::integer, 1,
  'A bad contract is isolated and logged');
select is((select count(*) from public.invoices), 0::bigint,
  'Automatic preparation never issues a numbered invoice');
select is((select count(*) from public.contract_billing_job_errors
  where contract_id = current_setting('test.invalid_contract')::uuid
    and resolved_at is null), 1::bigint,
  'The failing contract exposes one actionable error');
select set_config('test.auto_retry', public.run_contract_billing_generation()::text, true);
select is((current_setting('test.auto_retry')::jsonb->>'periods')::integer, 0,
  'A retry does not duplicate periods');
select is((current_setting('test.auto_retry')::jsonb->>'drafts')::integer, 0,
  'A retry does not duplicate drafts');
select is((select occurrences from public.contract_billing_job_errors
  where contract_id = current_setting('test.invalid_contract')::uuid), 2,
  'Repeated failures update one error record');
select is((select count(*) from public.invoice_contract_period_drafts), 2::bigint,
  'Only priced periods receive automatic drafts');

select * from finish();
rollback;
