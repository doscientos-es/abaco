begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into public.tenants (id, name) values
  ('50000000-0000-4000-8000-000000000001', 'Empresa contratos');
insert into public.clients (id, tenant_id, name) values
  ('50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000001', 'Comunidad piscina');
insert into public.service_locations (
  id, tenant_id, client_id, name, address, timezone
) values (
  '50000000-0000-4000-8000-000000000003',
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  'Piscina principal', 'Calle Sol 3', 'Europe/Madrid'
);
insert into auth.users (id, email) values
  ('50000000-0000-4000-8000-000000000004', 'owner-contract@example.test'),
  ('50000000-0000-4000-8000-000000000005', 'tech-contract@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000004', 'owner'),
  ('50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000005', 'technician');

set local role authenticated;
set local request.jwt.claim.sub = '50000000-0000-4000-8000-000000000004';
select set_config('test.contract_id', public.create_manual_service_contract(
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000003', null,
  'Mantenimiento de piscina', '2027-03-20', '2027-04-30',
  15000::bigint, 'monthly', '50000000-0000-4000-8000-000000000005',
  '[{"service":"revisión semanal"}]'::jsonb, '{}'::jsonb,
  '50000000-0000-4000-8000-000000000006'
)::text, true);
select is((select status from public.service_contracts
  where id = current_setting('test.contract_id')::uuid),
  'draft', 'A new contract starts in draft');
select is(public.create_manual_service_contract(
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000003', null,
  'Mantenimiento de piscina', '2027-03-20', '2027-04-30',
  15000::bigint, 'monthly', '50000000-0000-4000-8000-000000000005',
  '[{"service":"revisión semanal"}]'::jsonb, '{}'::jsonb,
  '50000000-0000-4000-8000-000000000006'
), current_setting('test.contract_id')::uuid,
  'Creating with the same operation key returns one contract');
select throws_ok(
  $$select public.create_manual_service_contract(
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000003', null,
    'Otro precio', '2027-03-20', '2027-04-30',
    15000::bigint, 'monthly', '50000000-0000-4000-8000-000000000005',
    '[]'::jsonb, '{}'::jsonb,
    '50000000-0000-4000-8000-000000000006')$$,
  '23505', 'La clave de operación ya se utilizó con otros datos',
  'Reusing an operation key with changed terms conflicts');
select set_config('test.contract_version', (
  select updated_at from public.service_contracts
  where id = current_setting('test.contract_id')::uuid
)::text, true);
select throws_ok(
  $$select public.transition_service_contract(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.contract_id')::uuid,
    current_setting('test.contract_version')::timestamptz,
    'active', '', '50000000-0000-4000-8000-000000000007')$$,
  'P0409', 'Añade una frecuencia antes de activar el contrato',
  'Activation requires at least one visit rule');
select set_config('test.rule_id', public.add_contract_visit_rule(
  '50000000-0000-4000-8000-000000000001',
  current_setting('test.contract_id')::uuid,
  current_setting('test.contract_version')::timestamptz,
  'high', array[4,3]::smallint[], 7::smallint, 1::smallint,
  '09:00'::time, 60::smallint, 'Revisión semanal',
  '50000000-0000-4000-8000-000000000008'
)::text, true);
select is((select months from public.service_contract_visit_rules
  where id = current_setting('test.rule_id')::uuid),
  array[3,4]::smallint[], 'Season months are normalized');
select is(public.add_contract_visit_rule(
  '50000000-0000-4000-8000-000000000001',
  current_setting('test.contract_id')::uuid,
  current_setting('test.contract_version')::timestamptz,
  'high', array[3,4]::smallint[], 7::smallint, 1::smallint,
  '09:00'::time, 60::smallint, 'Revisión semanal',
  '50000000-0000-4000-8000-000000000008'
), current_setting('test.rule_id')::uuid,
  'Retrying the rule command is idempotent after its version changed');
select is(public.transition_service_contract(
  '50000000-0000-4000-8000-000000000001',
  current_setting('test.contract_id')::uuid,
  (select updated_at from public.service_contracts
    where id = current_setting('test.contract_id')::uuid),
  'active', '', '50000000-0000-4000-8000-000000000009'
), 'active', 'Office activates a contract with a rule');
select public.create_service_visit(
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000003', null, null,
  'Visita puntual previa', '50000000-0000-4000-8000-000000000005',
  '2027-03-28 07:00+00', '2027-03-28 08:00+00', 'normal', '',
  '50000000-0000-4000-8000-000000000010'
);
select is(public.generate_contract_visits(
  '50000000-0000-4000-8000-000000000001',
  '2027-03-21', '2027-03-28'
), 2, 'The generator creates both Sunday occurrences');
select is((select scheduled_start_at from public.service_visits
  where contract_id = current_setting('test.contract_id')::uuid
    and contract_occurrence_on = '2027-03-21'),
  '2027-03-21 08:00+00'::timestamptz,
  'Winter local 09:00 uses UTC+1');
select is((select scheduled_start_at from public.service_visits
  where contract_id = current_setting('test.contract_id')::uuid
    and contract_occurrence_on = '2027-03-28'),
  '2027-03-28 07:00+00'::timestamptz,
  'Summer local 09:00 uses UTC+2');
select is(public.generate_contract_visits(
  '50000000-0000-4000-8000-000000000001',
  '2027-03-21', '2027-03-28'
), 0, 'Repeating the generator does not duplicate occurrences');
select is((select count(*) from public.service_visits
  where contract_id = current_setting('test.contract_id')::uuid),
  2::bigint, 'The contract has exactly two first-version visits');
select is((select count(*) from public.service_contract_generation_issues
  where kind = 'assignment_conflict'),
  1::bigint, 'A conflict is recorded once for office review');
select is((select count(*) from public.service_visits
  where contract_id = current_setting('test.contract_id')::uuid
    and assigned_user_id is null),
  1::bigint, 'The conflicting occurrence remains pending assignment');
select is((select count(*) from public.service_visit_events
  where actor_id is null), 2::bigint,
  'Generated visits have system-authored events');

set local request.jwt.claim.sub = '50000000-0000-4000-8000-000000000005';
select is((select count(*) from public.service_contracts), 0::bigint,
  'Technician cannot read contract prices or terms');
select is((select count(*) from public.service_visits
  where contract_id = current_setting('test.contract_id')::uuid), 1::bigint,
  'Technician sees only the assigned generated visit');
select throws_ok(
  $$select public.generate_contract_visits(
    '50000000-0000-4000-8000-000000000001',
    '2027-03-21', '2027-03-28')$$,
  '42501', 'No tienes permiso para generar visitas',
  'Technician cannot run the office generator');

set local request.jwt.claim.sub = '50000000-0000-4000-8000-000000000004';
select is(public.transition_service_contract(
  '50000000-0000-4000-8000-000000000001',
  current_setting('test.contract_id')::uuid,
  (select updated_at from public.service_contracts
    where id = current_setting('test.contract_id')::uuid),
  'paused', 'Parada estacional', '50000000-0000-4000-8000-000000000011'
), 'paused', 'Office pauses a contract');
select is((select count(*) from public.service_visits
  where contract_id = current_setting('test.contract_id')::uuid
    and status = 'canceled'), 2::bigint,
  'Pausing cancels only future unstarted contract visits');
select is(public.transition_service_contract(
  '50000000-0000-4000-8000-000000000001',
  current_setting('test.contract_id')::uuid,
  (select updated_at from public.service_contracts
    where id = current_setting('test.contract_id')::uuid),
  'active', '', '50000000-0000-4000-8000-000000000012'
), 'active', 'Office resumes the contract');
select is(public.generate_contract_visits(
  '50000000-0000-4000-8000-000000000001',
  '2027-03-21', '2027-03-28'
), 2, 'Resuming generates a new version without erasing history');
select is((select count(*) from public.service_visits
  where contract_id = current_setting('test.contract_id')::uuid),
  4::bigint, 'Old and new occurrences coexist for audit');

select * from finish();
rollback;
