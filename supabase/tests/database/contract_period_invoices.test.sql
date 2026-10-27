begin;
set local timezone = 'UTC';
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.tenants (id, name) values
  ('76000000-0000-4000-8000-000000000001', 'Empresa facturas contrato');
insert into public.clients (id, tenant_id, name) values
  ('76000000-0000-4000-8000-000000000002',
   '76000000-0000-4000-8000-000000000001', 'Cliente');
insert into public.service_locations (
  id, tenant_id, client_id, name, address, timezone
) values (
  '76000000-0000-4000-8000-000000000003',
  '76000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000002',
  'Piscina', 'Calle Uno 1', 'UTC'
);
insert into auth.users (id, email) values
  ('76000000-0000-4000-8000-000000000004', 'owner-period-invoice@example.test'),
  ('76000000-0000-4000-8000-000000000005', 'editor-period-invoice@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('76000000-0000-4000-8000-000000000001',
   '76000000-0000-4000-8000-000000000004', 'owner'),
  ('76000000-0000-4000-8000-000000000001',
   '76000000-0000-4000-8000-000000000005', 'editor');

set local role authenticated;
set local request.jwt.claim.sub = '76000000-0000-4000-8000-000000000004';
select set_config('test.invoice_contract', public.create_manual_service_contract(
  '76000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000002',
  '76000000-0000-4000-8000-000000000003', null,
  'Mantenimiento de piscina',
  (date_trunc('month', current_date)::date - interval '1 month')::date,
  null, 10000, 'monthly', null, '[]'::jsonb, '{}'::jsonb,
  '76000000-0000-4000-8000-000000000006'
)::text, true);
select public.add_contract_visit_rule(
  '76000000-0000-4000-8000-000000000001',
  current_setting('test.invoice_contract')::uuid,
  (select updated_at from public.service_contracts
   where id = current_setting('test.invoice_contract')::uuid),
  'high', array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[],
  1::smallint, 1::smallint, '09:00'::time, 60::smallint,
  'Revisión', '76000000-0000-4000-8000-000000000007'
);
select public.transition_service_contract(
  '76000000-0000-4000-8000-000000000001',
  current_setting('test.invoice_contract')::uuid,
  (select updated_at from public.service_contracts
   where id = current_setting('test.invoice_contract')::uuid),
  'active', '', '76000000-0000-4000-8000-000000000008'
);
select is(public.generate_contract_billing_periods(
  '76000000-0000-4000-8000-000000000001',
  current_setting('test.invoice_contract')::uuid, current_date
), 1, 'A completed prior cycle is generated');
select set_config('test.invoice_period', (select id from public.contract_billing_periods
  where contract_id = current_setting('test.invoice_contract')::uuid)::text, true);
select is((select pricing_status from public.contract_billing_periods
  where id = current_setting('test.invoice_period')::uuid),
  'requires_review', 'A cycle before activation has no assumed price');
select throws_ok(
  $$select public.create_invoice_contract_period_draft(
    '76000000-0000-4000-8000-000000000001',
    current_setting('test.invoice_period')::uuid)$$,
  'P0410', 'Valora el periodo antes de preparar la factura',
  'An unvalued period cannot become an invoice draft');
select set_config('test.invoice_valuation', public.value_contract_billing_period(
  '76000000-0000-4000-8000-000000000001',
  current_setting('test.invoice_period')::uuid,
  7000, 'Servicio prestado parcialmente'
)::text, true);
select throws_ok(
  $$select public.value_contract_billing_period(
    '76000000-0000-4000-8000-000000000001',
    current_setting('test.invoice_period')::uuid,
    11000, 'Exceso')$$,
  '22003', 'El importe supera la cuota pactada o el límite monetario',
  'Valuation cannot exceed the agreed cycle price');
select set_config('test.invoice_draft', public.create_invoice_contract_period_draft(
  '76000000-0000-4000-8000-000000000001',
  current_setting('test.invoice_period')::uuid
)::text, true);
select is((select total_cents from public.invoice_contract_period_drafts
  where id = current_setting('test.invoice_draft')::uuid),
  8470::bigint, 'The draft includes the frozen VAT on the reviewed net price');
select is(public.create_invoice_contract_period_draft(
  '76000000-0000-4000-8000-000000000001',
  current_setting('test.invoice_period')::uuid
)::text, current_setting('test.invoice_draft'), 'Draft preparation is idempotent');
select set_config('test.period_invoice', public.issue_invoice_contract_period_draft(
  '76000000-0000-4000-8000-000000000001',
  current_setting('test.invoice_draft')::uuid, 1,
  '76000000-0000-4000-8000-000000000009'
)::text, true);
select is((select contract_period_id from public.invoices
  where id = current_setting('test.period_invoice')::uuid),
  current_setting('test.invoice_period')::uuid,
  'The issued invoice retains its unique contract period origin');
select is((select document_snapshot->>'contractTitle' from public.invoices
  where id = current_setting('test.period_invoice')::uuid),
  'Mantenimiento de piscina', 'The issued document captures its contract title');
select is(public.issue_invoice_contract_period_draft(
  '76000000-0000-4000-8000-000000000001',
  current_setting('test.invoice_draft')::uuid, 1,
  '76000000-0000-4000-8000-000000000009'
)::text, current_setting('test.period_invoice'), 'Issuance retry returns the same invoice');
select public.record_contract_cost(
  '76000000-0000-4000-8000-000000000001',
  current_setting('test.invoice_contract')::uuid, null,
  'labor', 'Horas de mantenimiento', 2, 'h', 1000,
  current_date, '', '76000000-0000-4000-8000-000000000010'
);
select is(public.contract_profitability_summary(
  '76000000-0000-4000-8000-000000000001',
  current_setting('test.invoice_contract')::uuid
)->>'billedNetCents', '7000', 'Profitability separates net invoiced revenue');
select is(public.contract_profitability_summary(
  '76000000-0000-4000-8000-000000000001',
  current_setting('test.invoice_contract')::uuid
)->>'actualCostCents', '2000', 'Profitability includes contract costs once');
select public.record_invoice_payment(
  current_setting('test.period_invoice')::uuid, 8470, current_date,
  '76000000-0000-4000-8000-000000000011'
);
select is(public.contract_profitability_summary(
  '76000000-0000-4000-8000-000000000001',
  current_setting('test.invoice_contract')::uuid
)->>'collectedGrossCents', '8470', 'Gross cash is distinct from net revenue');
select is((select category from public.ledger_entries
  where id = (select ledger_entry_id from public.invoice_payment_operations
    where invoice_id = current_setting('test.period_invoice')::uuid)),
  'Cobro de contrato', 'The payment ledger retains contract origin');
select throws_ok(
  $$select public.create_invoice_contract_period_draft(
    '76000000-0000-4000-8000-000000000001',
    current_setting('test.invoice_period')::uuid)$$,
  'P0409', 'Este periodo ya se facturó',
  'One contract period cannot be billed twice');

select * from finish();
rollback;
