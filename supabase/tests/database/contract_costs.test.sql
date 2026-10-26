begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.tenants (id, name) values
  ('74000000-0000-4000-8000-000000000001', 'Empresa costes contrato');
insert into public.clients (id, tenant_id, name) values
  ('74000000-0000-4000-8000-000000000002',
   '74000000-0000-4000-8000-000000000001', 'Cliente');
insert into public.service_locations (
  id, tenant_id, client_id, name, address, timezone
) values (
  '74000000-0000-4000-8000-000000000003',
  '74000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000002',
  'Piscina', 'Calle Uno 1', 'Europe/Madrid'
);
insert into auth.users (id, email) values
  ('74000000-0000-4000-8000-000000000004', 'owner-contract-cost@example.test'),
  ('74000000-0000-4000-8000-000000000005', 'editor-contract-cost@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('74000000-0000-4000-8000-000000000001',
   '74000000-0000-4000-8000-000000000004', 'owner'),
  ('74000000-0000-4000-8000-000000000001',
   '74000000-0000-4000-8000-000000000005', 'editor');

set local role authenticated;
set local request.jwt.claim.sub = '74000000-0000-4000-8000-000000000004';
select set_config('test.contract_cost_contract', public.create_manual_service_contract(
  '74000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000003', null,
  'Mantenimiento', '2027-01-01', '2027-12-31',
  10000, 'monthly', null, '[]'::jsonb, '{}'::jsonb,
  '74000000-0000-4000-8000-000000000006'
)::text, true);
select set_config('test.contract_cost_entry', public.record_contract_cost(
  '74000000-0000-4000-8000-000000000001',
  current_setting('test.contract_cost_contract')::uuid, null,
  'labor', 'Horas de mantenimiento', 2.5, 'h', 1200,
  current_date, '', '74000000-0000-4000-8000-000000000007'
)::text, true);
select is(public.contract_cost_summary(
  '74000000-0000-4000-8000-000000000001',
  current_setting('test.contract_cost_contract')::uuid
)->>'netCents', '3000', 'The server sums historical contract costs');
select is(public.contract_cost_summary(
  '74000000-0000-4000-8000-000000000001',
  current_setting('test.contract_cost_contract')::uuid
)->>'activeCount', '1', 'An active cost is present');
select is(public.record_contract_cost(
  '74000000-0000-4000-8000-000000000001',
  current_setting('test.contract_cost_contract')::uuid, null,
  'labor', 'Horas de mantenimiento', 2.5, 'h', 1200,
  current_date, '', '74000000-0000-4000-8000-000000000007'
)::text, current_setting('test.contract_cost_entry'),
  'Retrying the command returns the same entry');
select throws_ok(
  $$select public.record_contract_cost(
    '74000000-0000-4000-8000-000000000001',
    current_setting('test.contract_cost_contract')::uuid, null,
    'labor', 'Otro coste', 2.5, 'h', 1200,
    current_date, '', '74000000-0000-4000-8000-000000000007')$$,
  '23505', 'La clave de operación ya se utilizó con otros datos',
  'Reusing an operation key with changed terms is rejected');
select set_config('test.contract_cost_reversal', public.reverse_contract_cost(
  '74000000-0000-4000-8000-000000000001',
  current_setting('test.contract_cost_entry')::uuid,
  '74000000-0000-4000-8000-000000000008'
)::text, true);
select is(public.contract_cost_summary(
  '74000000-0000-4000-8000-000000000001',
  current_setting('test.contract_cost_contract')::uuid
)->>'netCents', '0', 'A reversal nets the cost to zero');
select is(public.contract_cost_summary(
  '74000000-0000-4000-8000-000000000001',
  current_setting('test.contract_cost_contract')::uuid
)->>'activeCount', '0', 'No active cost remains after reversal');
select throws_ok(
  $$select public.reverse_contract_cost(
    '74000000-0000-4000-8000-000000000001',
    current_setting('test.contract_cost_entry')::uuid,
    '74000000-0000-4000-8000-000000000009')$$,
  '23505', 'Este coste ya fue anulado',
  'A cost cannot be reversed twice');

set local request.jwt.claim.sub = '74000000-0000-4000-8000-000000000005';
select is((select count(*) from public.contract_cost_entries), 0::bigint,
  'An editor cannot read internal contract costs');
select throws_ok(
  $$select public.contract_cost_summary(
    '74000000-0000-4000-8000-000000000001',
    current_setting('test.contract_cost_contract')::uuid)$$,
  '42501', 'No tienes permiso para consultar costes',
  'An editor cannot invoke the privileged summary');
select throws_ok(
  $$select public.record_contract_cost(
    '74000000-0000-4000-8000-000000000001',
    current_setting('test.contract_cost_contract')::uuid, null,
    'labor', 'Intento', 1, 'h', 100,
    current_date, '', '74000000-0000-4000-8000-000000000010')$$,
  '42501', 'No tienes permiso para registrar costes',
  'An editor cannot invoke the privileged command');

select * from finish();
rollback;
