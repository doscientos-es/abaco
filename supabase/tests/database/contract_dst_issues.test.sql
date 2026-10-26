begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.tenants (id, name) values
  ('51000000-0000-4000-8000-000000000001', 'Empresa horario local');
insert into public.clients (id, tenant_id, name) values
  ('51000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000001', 'Cliente zona horaria');
insert into public.service_locations (
  id, tenant_id, client_id, name, address, timezone
) values (
  '51000000-0000-4000-8000-000000000003',
  '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000002',
  'Piscina', 'Calle Hora 2', 'Europe/Madrid'
);
insert into auth.users (id, email) values
  ('51000000-0000-4000-8000-000000000004', 'owner-dst@example.test'),
  ('51000000-0000-4000-8000-000000000005', 'tech-dst@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000004', 'owner'),
  ('51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000005', 'technician');

set local role authenticated;
set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000004';
select set_config('test.dst_contract', public.create_manual_service_contract(
  '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000002',
  '51000000-0000-4000-8000-000000000003', null,
  'Revisión nocturna', '2027-03-28', '2027-10-31',
  1000::bigint, 'monthly', null, '[]'::jsonb, '{}'::jsonb,
  '51000000-0000-4000-8000-000000000006'
)::text, true);
select public.add_contract_visit_rule(
  '51000000-0000-4000-8000-000000000001',
  current_setting('test.dst_contract')::uuid,
  (select updated_at from public.service_contracts
    where id = current_setting('test.dst_contract')::uuid),
  'high', array[3,10]::smallint[], 7::smallint, 1::smallint,
  '02:30'::time, 60::smallint, 'Visita nocturna',
  '51000000-0000-4000-8000-000000000007'
);
select public.transition_service_contract(
  '51000000-0000-4000-8000-000000000001',
  current_setting('test.dst_contract')::uuid,
  (select updated_at from public.service_contracts
    where id = current_setting('test.dst_contract')::uuid),
  'active', '', '51000000-0000-4000-8000-000000000008'
);
select is(public.generate_contract_visits(
  '51000000-0000-4000-8000-000000000001',
  '2027-03-28', '2027-03-28'
), 0, 'Nonexistent spring hour does not create a visit');
select is((select count(*) from public.service_contract_generation_issues
  where occurrence_on = '2027-03-28' and kind = 'invalid_local_time'),
  1::bigint, 'Spring anomaly is recorded for office review');
select is(public.generate_contract_visits(
  '51000000-0000-4000-8000-000000000001',
  '2027-03-28', '2027-03-28'
), 0, 'Retrying an anomalous occurrence has no side effect');
select is((select count(*) from public.service_contract_generation_issues),
  1::bigint, 'Retry does not duplicate the anomaly');
select is(public.generate_contract_visits(
  '51000000-0000-4000-8000-000000000001',
  '2027-10-31', '2027-10-31'
), 0, 'Ambiguous autumn hour does not create a visit');
select is((select count(*) from public.service_contract_generation_issues
  where kind = 'invalid_local_time'),
  2::bigint, 'Both clock changes have separate audit records');
select is((select count(*) from public.service_visits
  where contract_id = current_setting('test.dst_contract')::uuid),
  0::bigint, 'No invalid local occurrence reaches the technician agenda');

set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000005';
select is((select count(*) from public.service_contract_generation_issues),
  0::bigint, 'Technician cannot browse office generation issues');

select * from finish();
rollback;
