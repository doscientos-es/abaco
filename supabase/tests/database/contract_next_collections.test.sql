begin;
set local timezone = 'UTC';
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.tenants (id, name) values
  ('82000000-0000-4000-8000-000000000001', 'Collection tests'),
  ('82000000-0000-4000-8000-000000000002', 'Other collection tests');
insert into auth.users (id, email) values
  ('82000000-0000-4000-8000-000000000021', 'collections-owner@example.test'),
  ('82000000-0000-4000-8000-000000000022', 'collections-editor@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000021', 'owner'),
  ('82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000022', 'editor');
insert into public.clients (id, tenant_id, name) values
  ('82000000-0000-4000-8000-000000000011', '82000000-0000-4000-8000-000000000001', 'Client'),
  ('82000000-0000-4000-8000-000000000012', '82000000-0000-4000-8000-000000000002', 'Other client');
insert into public.service_contracts (
  id, operation_id, tenant_id, client_id, title, starts_on, timezone,
  price_cents, billing_frequency, source_snapshot, created_by
) values
  ('82000000-0000-4000-8000-000000000101', gen_random_uuid(), '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000011', 'With collections', current_date - 100, 'UTC', 10000, 'monthly', '{}', '82000000-0000-4000-8000-000000000021'),
  ('82000000-0000-4000-8000-000000000102', gen_random_uuid(), '82000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000011', 'Without collections', current_date, 'UTC', 10000, 'once', '{}', '82000000-0000-4000-8000-000000000021'),
  ('82000000-0000-4000-8000-000000000103', gen_random_uuid(), '82000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000012', 'Other tenant', current_date, 'UTC', 10000, 'monthly', '{}', '82000000-0000-4000-8000-000000000021');
insert into public.contract_billing_periods (
  id, tenant_id, contract_id, cycle_index, period_start_on, period_end_on, net_cents, vat_rate, pricing_status
) select ('82000000-0000-4000-8000-00000000020' || n)::uuid,
  '82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000101',
  n, current_date - 100 + n * 20, current_date - 81 + n * 20, 10000, 21, 'priced'
from generate_series(1, 4) n;
insert into public.invoices (
  id, tenant_id, contract_period_id, issue_operation_id, client_id, concept,
  total_cents, vat_rate, issued_at, due_date
) select ('82000000-0000-4000-8000-00000000030' || n)::uuid,
  '82000000-0000-4000-8000-000000000001', ('82000000-0000-4000-8000-00000000020' || n)::uuid,
  gen_random_uuid(), '82000000-0000-4000-8000-000000000011', 'Collection test', 12100, 21,
  current_date - 20, current_date - 15 + n * 5
from generate_series(1, 2) n;
insert into public.invoice_contract_period_drafts (
  id, tenant_id, contract_period_id, contract_id, client_id, concept, total_cents, vat_rate, due_date
) select ('82000000-0000-4000-8000-00000000040' || n)::uuid,
  '82000000-0000-4000-8000-000000000001', ('82000000-0000-4000-8000-00000000020' || n)::uuid,
  '82000000-0000-4000-8000-000000000101', '82000000-0000-4000-8000-000000000011',
  'Next collection draft', 12100, 21, current_date + (n - 2) * 10
from generate_series(3, 4) n;

set local role authenticated;
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000021';
select public.record_invoice_payment('82000000-0000-4000-8000-000000000301', 12100, current_date, gen_random_uuid());
select public.record_invoice_payment('82000000-0000-4000-8000-000000000302', 100, current_date, gen_random_uuid());

select is((select due_on from public.list_contract_next_collections(
  '82000000-0000-4000-8000-000000000001', array['82000000-0000-4000-8000-000000000101'::uuid])),
  current_date - 5, 'Paid invoices are excluded but partially paid invoices remain');
select is((select source from public.list_contract_next_collections(
  '82000000-0000-4000-8000-000000000001', array['82000000-0000-4000-8000-000000000101'::uuid])),
  'invoice', 'Issued invoices are distinguished from drafts');
select ok((select is_overdue from public.list_contract_next_collections(
  '82000000-0000-4000-8000-000000000001', array['82000000-0000-4000-8000-000000000101'::uuid])),
  'Overdue invoices stay visible instead of being skipped');
select is((select count(*) from public.list_contract_next_collections(
  '82000000-0000-4000-8000-000000000001', array['82000000-0000-4000-8000-000000000102'::uuid])),
  0::bigint, 'No date is invented for an unbilled contract');

select public.record_invoice_payment('82000000-0000-4000-8000-000000000302', 12000, current_date, gen_random_uuid());
select is((select due_on from public.list_contract_next_collections(
  '82000000-0000-4000-8000-000000000001', array['82000000-0000-4000-8000-000000000101'::uuid])),
  current_date + 10, 'The nearest open draft follows the settled invoice');
select is((select source from public.list_contract_next_collections(
  '82000000-0000-4000-8000-000000000001', array['82000000-0000-4000-8000-000000000101'::uuid])),
  'draft', 'An unissued collection is marked as a draft');
select ok(not (select is_overdue from public.list_contract_next_collections(
  '82000000-0000-4000-8000-000000000001', array['82000000-0000-4000-8000-000000000101'::uuid])),
  'A future draft is not overdue');
select public.issue_invoice_contract_period_draft('82000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000403', 1, gen_random_uuid());
select is((select source from public.list_contract_next_collections(
  '82000000-0000-4000-8000-000000000001', array['82000000-0000-4000-8000-000000000101'::uuid])),
  'invoice', 'Issued drafts are replaced by the actual invoice');
select is((select count(*) from public.list_contract_next_collections(
  '82000000-0000-4000-8000-000000000001', array['82000000-0000-4000-8000-000000000101'::uuid, '82000000-0000-4000-8000-000000000101'::uuid])),
  1::bigint, 'Duplicate requested ids do not duplicate collections');
select is((select count(*) from public.list_contract_next_collections(
  '82000000-0000-4000-8000-000000000001', array['82000000-0000-4000-8000-000000000103'::uuid])),
  0::bigint, 'Foreign contract ids cannot cross tenant boundaries');
select is((select count(*) from public.list_contract_next_collections(
  '82000000-0000-4000-8000-000000000001', '{}'::uuid[])), 0::bigint, 'Empty pages return no collections');
select throws_ok($$select * from public.list_contract_next_collections(
  '82000000-0000-4000-8000-000000000002', '{}'::uuid[])$$,
  '42501', 'No tienes permiso para consultar cobros de contratos', 'Another tenant is forbidden');
select throws_ok($$select * from public.list_contract_next_collections(
  '82000000-0000-4000-8000-000000000001', array_fill(gen_random_uuid(), array[101]))$$,
  '22023', 'Consulta de cobros de contratos inválida', 'Oversized lookups are rejected');
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000022';
select is((select count(*) from public.list_contract_next_collections(
  '82000000-0000-4000-8000-000000000001', array['82000000-0000-4000-8000-000000000101'::uuid])),
  1::bigint, 'Editors can read the collections covered by existing RLS policies');
select ok(not has_function_privilege('anon', 'public.list_contract_next_collections(uuid,uuid[])', 'EXECUTE'),
  'Anonymous users cannot call the endpoint');

select * from finish();
rollback;
