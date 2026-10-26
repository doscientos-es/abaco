begin;
set local timezone = 'UTC';
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.tenants (id, name) values
  ('75000000-0000-4000-8000-000000000001', 'Empresa cuotas');
insert into public.clients (id, tenant_id, name) values
  ('75000000-0000-4000-8000-000000000002',
   '75000000-0000-4000-8000-000000000001', 'Cliente');
insert into public.service_locations (
  id, tenant_id, client_id, name, address, timezone
) values (
  '75000000-0000-4000-8000-000000000003',
  '75000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000002',
  'Piscina', 'Calle Uno 1', 'UTC'
);
insert into auth.users (id, email) values
  ('75000000-0000-4000-8000-000000000004', 'owner-period@example.test'),
  ('75000000-0000-4000-8000-000000000005', 'editor-period@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('75000000-0000-4000-8000-000000000001',
   '75000000-0000-4000-8000-000000000004', 'owner'),
  ('75000000-0000-4000-8000-000000000001',
   '75000000-0000-4000-8000-000000000005', 'editor');

set local role authenticated;
set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000004';
select set_config('test.billing_contract', public.create_manual_service_contract(
  '75000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000002',
  '75000000-0000-4000-8000-000000000003', null,
  'Mantenimiento',
  (date_trunc('month', current_date)::date - interval '3 months')::date,
  null, 10000, 'monthly', null, '[]'::jsonb, '{}'::jsonb,
  '75000000-0000-4000-8000-000000000006'
)::text, true);
select public.add_contract_visit_rule(
  '75000000-0000-4000-8000-000000000001',
  current_setting('test.billing_contract')::uuid,
  (select updated_at from public.service_contracts
   where id = current_setting('test.billing_contract')::uuid),
  'high', array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[],
  1::smallint, 1::smallint, '09:00'::time, 60::smallint,
  'Revisión', '75000000-0000-4000-8000-000000000007'
);
select public.transition_service_contract(
  '75000000-0000-4000-8000-000000000001',
  current_setting('test.billing_contract')::uuid,
  (select updated_at from public.service_contracts
   where id = current_setting('test.billing_contract')::uuid),
  'active', '', '75000000-0000-4000-8000-000000000008'
);
set local role postgres;
insert into public.service_contract_events (
  operation_id, tenant_id, contract_id, kind, payload, actor_id, occurred_at
) values (
  '75000000-0000-4000-8000-000000000012',
  '75000000-0000-4000-8000-000000000001',
  current_setting('test.billing_contract')::uuid,
  'status_changed', '{"from":"draft","to":"active"}'::jsonb,
  '75000000-0000-4000-8000-000000000004',
  (date_trunc('month', current_date)::date - interval '3 months')::timestamptz
);
set local role authenticated;
select is(public.generate_contract_billing_periods(
  '75000000-0000-4000-8000-000000000001',
  current_setting('test.billing_contract')::uuid, current_date
), 3, 'Only three completed monthly periods are generated');
select is((select count(*) from public.contract_billing_periods), 3::bigint,
  'One row is retained for each cycle');
select is((select count(*) from public.contract_billing_periods
  where net_cents = 10000 and vat_rate = 21 and pricing_status = 'priced'),
  3::bigint, 'Full cycles retain the agreed price and VAT');
select is(public.generate_contract_billing_periods(
  '75000000-0000-4000-8000-000000000001',
  current_setting('test.billing_contract')::uuid, current_date
), 0, 'Regeneration is idempotent');
select throws_ok(
  $$select public.generate_contract_billing_periods(
    '75000000-0000-4000-8000-000000000001',
    current_setting('test.billing_contract')::uuid,
    current_date + 40)$$,
  '22023', 'Intervalo de facturación inválido',
  'The generator rejects a distant future horizon');

select set_config('test.partial_contract', public.create_manual_service_contract(
  '75000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000002',
  '75000000-0000-4000-8000-000000000003', null,
  'Mantenimiento parcial',
  (date_trunc('month', current_date)::date - interval '3 months')::date,
  current_date,
  10000, 'quarterly', null, '[]'::jsonb, '{}'::jsonb,
  '75000000-0000-4000-8000-000000000009'
)::text, true);
select public.add_contract_visit_rule(
  '75000000-0000-4000-8000-000000000001',
  current_setting('test.partial_contract')::uuid,
  (select updated_at from public.service_contracts
   where id = current_setting('test.partial_contract')::uuid),
  'high', array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[],
  2::smallint, 1::smallint, '09:00'::time, 60::smallint,
  'Revisión', '75000000-0000-4000-8000-000000000010'
);
select public.transition_service_contract(
  '75000000-0000-4000-8000-000000000001',
  current_setting('test.partial_contract')::uuid,
  (select updated_at from public.service_contracts
   where id = current_setting('test.partial_contract')::uuid),
  'active', '', '75000000-0000-4000-8000-000000000011'
);
set local role postgres;
insert into public.service_contract_events (
  operation_id, tenant_id, contract_id, kind, payload, actor_id, occurred_at
) values (
  '75000000-0000-4000-8000-000000000013',
  '75000000-0000-4000-8000-000000000001',
  current_setting('test.partial_contract')::uuid,
  'status_changed', '{"from":"draft","to":"active"}'::jsonb,
  '75000000-0000-4000-8000-000000000004',
  (date_trunc('month', current_date)::date - interval '3 months')::timestamptz
);
set local role authenticated;
select is(public.generate_contract_billing_periods(
  '75000000-0000-4000-8000-000000000001',
  current_setting('test.partial_contract')::uuid, current_date
), 2, 'A final partial cycle is recorded');
select is((select count(*) from public.contract_billing_periods
  where contract_id = current_setting('test.partial_contract')::uuid
    and pricing_status = 'requires_review' and net_cents is null),
  1::bigint, 'A partial cycle has no invented price');

set local request.jwt.claim.sub = '75000000-0000-4000-8000-000000000005';
select is((select count(*) from public.contract_billing_periods), 5::bigint,
  'An editor may inspect periods for office coordination');
select throws_ok(
  $$select public.generate_contract_billing_periods(
    '75000000-0000-4000-8000-000000000001',
    current_setting('test.billing_contract')::uuid, current_date)$$,
  '42501', 'No tienes permiso para generar periodos',
  'An editor cannot create commercial obligations');

select * from finish();
rollback;
