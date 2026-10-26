begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.tenants (id, name) values
  ('44000000-0000-4000-8000-000000000001', 'Empresa costes');
insert into public.clients (id, tenant_id, name) values
  ('44000000-0000-4000-8000-000000000002',
    '44000000-0000-4000-8000-000000000001', 'Cliente costes');
insert into auth.users (id, email) values
  ('44000000-0000-4000-8000-000000000003', 'owner-cost@example.test'),
  ('44000000-0000-4000-8000-000000000004', 'editor-cost@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('44000000-0000-4000-8000-000000000001',
    '44000000-0000-4000-8000-000000000003', 'owner'),
  ('44000000-0000-4000-8000-000000000001',
    '44000000-0000-4000-8000-000000000004', 'editor');

set local role authenticated;
set local request.jwt.claim.sub = '44000000-0000-4000-8000-000000000003';
select set_config('test.work_id', public.create_manual_work_order(
  '44000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000002',
  'Trabajo con costes', 'repair', null, null, '',
  '44000000-0000-4000-8000-000000000005'
)::text, true);
select set_config('test.cost_id', public.record_work_cost(
  '44000000-0000-4000-8000-000000000001',
  current_setting('test.work_id')::uuid, null,
  'labor', 'Horas de reparación', 2.5, 'h', 1234,
  current_date, '', '44000000-0000-4000-8000-000000000006'
)::text, true);
select is((select count(*) from public.work_cost_entries), 1::bigint,
  'One actual cost is recorded');
select is((select signed_total_cost_cents from public.work_cost_entries), 3085::bigint,
  'The server calculates quantity times historical unit cost in cents');
select is(public.record_work_cost(
  '44000000-0000-4000-8000-000000000001',
  current_setting('test.work_id')::uuid, null,
  'labor', 'Horas de reparación', 2.5, 'h', 1234,
  current_date, '', '44000000-0000-4000-8000-000000000006'
)::text, current_setting('test.cost_id'),
  'Retrying a cost operation returns the same entry');
select throws_ok(
  $$select public.record_work_cost(
    '44000000-0000-4000-8000-000000000001',
    current_setting('test.work_id')::uuid, null,
    'labor', 'Otro coste', 2.5, 'h', 1234,
    current_date, '', '44000000-0000-4000-8000-000000000006')$$,
  '23505', 'La clave de operación ya se utilizó con otros datos',
  'An operation key cannot be reused with different cost data');
select throws_ok(
  $$select public.record_work_cost(
    '44000000-0000-4000-8000-000000000001',
    current_setting('test.work_id')::uuid, null,
    'labor', 'Cantidad imprecisa', 1.2345, 'h', 100,
    current_date, '', '44000000-0000-4000-8000-000000000011')$$,
  '22023', 'Datos de coste inválidos',
  'Quantities with more than three decimals are rejected');
select set_config('test.reversal_id', public.reverse_work_cost(
  '44000000-0000-4000-8000-000000000001',
  current_setting('test.cost_id')::uuid,
  '44000000-0000-4000-8000-000000000007'
)::text, true);
select is((select signed_total_cost_cents from public.work_cost_entries
  where id = current_setting('test.reversal_id')::uuid), -3085::bigint,
  'The reversal carries the opposite amount');
select is((select sum(signed_total_cost_cents) from public.work_cost_entries), 0::numeric,
  'The original and reversal net to zero');
select is(public.work_cost_summary(
  '44000000-0000-4000-8000-000000000001',
  current_setting('test.work_id')::uuid
)->>'netCents', '0',
  'The server computes the complete net cost across entries');
select is(public.reverse_work_cost(
  '44000000-0000-4000-8000-000000000001',
  current_setting('test.cost_id')::uuid,
  '44000000-0000-4000-8000-000000000007'
)::text, current_setting('test.reversal_id'),
  'Retrying a reversal returns its original entry');
select throws_ok(
  $$select public.reverse_work_cost(
    '44000000-0000-4000-8000-000000000001',
    current_setting('test.cost_id')::uuid,
    '44000000-0000-4000-8000-000000000008')$$,
  'P0409', 'El coste ya se anuló',
  'A cost cannot be reversed twice');
select throws_ok(
  $$select public.reverse_work_cost(
    '44000000-0000-4000-8000-000000000001',
    current_setting('test.reversal_id')::uuid,
    '44000000-0000-4000-8000-000000000009')$$,
  'P0409', 'El coste ya se anuló',
  'A reversal cannot itself be reversed');

set local request.jwt.claim.sub = '44000000-0000-4000-8000-000000000004';
select is((select count(*) from public.work_cost_entries), 0::bigint,
  'An editor cannot read internal costs through SQL');
select throws_ok(
  $$select public.work_cost_summary(
    '44000000-0000-4000-8000-000000000001',
    current_setting('test.work_id')::uuid)$$,
  '42501', 'No tienes permiso para consultar costes',
  'An editor cannot bypass cost RLS through the summary function');
select throws_ok(
  $$select public.record_work_cost(
    '44000000-0000-4000-8000-000000000001',
    current_setting('test.work_id')::uuid, null,
    'material', 'Pieza', 1, 'ud', 100,
    current_date, '', '44000000-0000-4000-8000-000000000010')$$,
  '42501', 'No tienes permiso para registrar costes',
  'An editor cannot invoke the privileged cost command');

set local role postgres;
select throws_ok(
  $$update public.work_cost_entries set unit_cost_cents = 1
    where id = current_setting('test.cost_id')::uuid$$,
  'P0001', 'El coste registrado es inmutable; crea una anulación',
  'Even privileged updates cannot rewrite historic cost');

select * from finish();
rollback;
