begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.tenants (id, name) values
  ('78000000-0000-4000-8000-000000000001', 'Empresa imputaciones');
insert into public.clients (id, tenant_id, name) values
  ('78000000-0000-4000-8000-000000000002',
   '78000000-0000-4000-8000-000000000001', 'Cliente');
insert into auth.users (id, email) values
  ('78000000-0000-4000-8000-000000000003', 'owner-allocation@example.test'),
  ('78000000-0000-4000-8000-000000000004', 'editor-allocation@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('78000000-0000-4000-8000-000000000001',
   '78000000-0000-4000-8000-000000000003', 'owner'),
  ('78000000-0000-4000-8000-000000000001',
   '78000000-0000-4000-8000-000000000004', 'editor');
insert into public.ledger_entries (
  id, tenant_id, kind, entry_date, concept, amount_cents, vat_rate
) values
  ('78000000-0000-4000-8000-000000000010',
   '78000000-0000-4000-8000-000000000001', 'expense', current_date,
   'Material ya registrado', 12100, 21),
  ('78000000-0000-4000-8000-000000000011',
   '78000000-0000-4000-8000-000000000001', 'expense', current_date,
   'Gasto repartible', 12100, 21),
  ('78000000-0000-4000-8000-000000000012',
   '78000000-0000-4000-8000-000000000001', 'income', current_date,
   'Cobro', 12100, 21),
  ('78000000-0000-4000-8000-000000000017',
   '78000000-0000-4000-8000-000000000001', 'expense', current_date,
   'Otro justificante', 12100, 21);

set local role authenticated;
set local request.jwt.claim.sub = '78000000-0000-4000-8000-000000000003';
select set_config('test.allocation_work', public.create_manual_work_order(
  '78000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000002',
  'Trabajo imputado', 'repair', null, null, '',
  '78000000-0000-4000-8000-000000000005'
)::text, true);
select set_config('test.allocation_cost', public.record_work_cost(
  '78000000-0000-4000-8000-000000000001',
  current_setting('test.allocation_work')::uuid, null,
  'material', 'Material', 1, 'ud', 10000, current_date, '',
  '78000000-0000-4000-8000-000000000006'
)::text, true);
select set_config('test.linked_allocation', public.allocate_ledger_expense(
  '78000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000010',
  current_setting('test.allocation_work')::uuid, null, 12100,
  current_setting('test.allocation_cost')::uuid, null,
  '78000000-0000-4000-8000-000000000007'
)::text, true);
select is((public.work_profitability_summary(
  '78000000-0000-4000-8000-000000000001',
  current_setting('test.allocation_work')::uuid
)->>'actualCostCents')::bigint, 10000::bigint,
  'Linking an expense to an existing operational cost does not double it');
select is((public.work_profitability_summary(
  '78000000-0000-4000-8000-000000000001',
  current_setting('test.allocation_work')::uuid
)->>'expenseAllocationCount')::bigint, 0::bigint,
  'A linked allocation is excluded from the extra expense total');
select is(public.allocate_ledger_expense(
  '78000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000010',
  current_setting('test.allocation_work')::uuid, null, 12100,
  current_setting('test.allocation_cost')::uuid, null,
  '78000000-0000-4000-8000-000000000007'
)::text, current_setting('test.linked_allocation'),
  'A repeated operation returns the original allocation');
select set_config('test.free_allocation', public.allocate_ledger_expense(
  '78000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000011',
  current_setting('test.allocation_work')::uuid, null, 6050,
  null, null, '78000000-0000-4000-8000-000000000008'
)::text, true);
select is((public.work_profitability_summary(
  '78000000-0000-4000-8000-000000000001',
  current_setting('test.allocation_work')::uuid
)->>'actualCostCents')::bigint, 15000::bigint,
  'A partial unlinked expense contributes only its net amount');
select is((public.work_profitability_summary(
  '78000000-0000-4000-8000-000000000001',
  current_setting('test.allocation_work')::uuid
)->>'activeCostCount')::bigint, 2::bigint,
  'Recorded cost and unlinked allocation both count as cost evidence');
select throws_ok(
  $$select public.allocate_ledger_expense(
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000011',
    current_setting('test.allocation_work')::uuid, null, 6051,
    null, null, '78000000-0000-4000-8000-000000000009')$$,
  '22003', 'La imputación supera el saldo del gasto',
  'A split cannot exceed the expense gross amount');
select throws_ok(
  $$select public.allocate_ledger_expense(
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000012',
    current_setting('test.allocation_work')::uuid, null, 12100,
    null, null, '78000000-0000-4000-8000-000000000013')$$,
  'P0002', 'Gasto no encontrado', 'Income cannot be allocated as an expense');
select set_config('test.allocation_reversal', public.reverse_ledger_expense_allocation(
  '78000000-0000-4000-8000-000000000001',
  current_setting('test.free_allocation')::uuid,
  '78000000-0000-4000-8000-000000000014'
)::text, true);
select is((public.work_profitability_summary(
  '78000000-0000-4000-8000-000000000001',
  current_setting('test.allocation_work')::uuid
)->>'actualCostCents')::bigint, 10000::bigint,
  'Reversing an allocation removes its contribution to the margin');
select is(public.reverse_ledger_expense_allocation(
  '78000000-0000-4000-8000-000000000001',
  current_setting('test.free_allocation')::uuid,
  '78000000-0000-4000-8000-000000000014'
)::text, current_setting('test.allocation_reversal'),
  'Reversing with the same operation key is idempotent');
select throws_ok(
  $$select public.allocate_ledger_expense(
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000017',
    current_setting('test.allocation_work')::uuid, null, 12100,
    current_setting('test.allocation_cost')::uuid, null,
    '78000000-0000-4000-8000-000000000015')$$,
  '22023', 'Coste operativo incompatible o ya vinculado',
  'An operational cost cannot be linked to two active allocations');
select public.reverse_work_cost(
  '78000000-0000-4000-8000-000000000001',
  current_setting('test.allocation_cost')::uuid,
  '78000000-0000-4000-8000-000000000018'
);
select is((public.work_profitability_summary(
  '78000000-0000-4000-8000-000000000001',
  current_setting('test.allocation_work')::uuid
)->>'actualCostCents')::bigint, 10000::bigint,
  'The allocated expense replaces a linked operational cost after that cost is reversed');
set local request.jwt.claim.sub = '78000000-0000-4000-8000-000000000004';
select throws_ok(
  $$select public.allocate_ledger_expense(
    '78000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000011',
    current_setting('test.allocation_work')::uuid, null, 6050,
    null, null, '78000000-0000-4000-8000-000000000016')$$,
  '42501', 'Sin permiso para imputar gastos',
  'An editor cannot allocate expenses');
select is((select count(*) from public.ledger_expense_allocations), 0::bigint,
  'An editor cannot read allocation details');

select * from finish();
rollback;
