begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.tenants (id, name) values
  ('47000000-0000-4000-8000-000000000001', 'Empresa con técnicos');
insert into public.clients (id, tenant_id, name) values
  ('47000000-0000-4000-8000-000000000002',
    '47000000-0000-4000-8000-000000000001', 'Cliente privado');
insert into auth.users (id, email) values
  ('47000000-0000-4000-8000-000000000003', 'owner-tech@example.test'),
  ('47000000-0000-4000-8000-000000000004', 'tech-one@example.test'),
  ('47000000-0000-4000-8000-000000000005', 'tech-two@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('47000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000003', 'owner'),
  ('47000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000004', 'technician'),
  ('47000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000005', 'technician');

set local role authenticated;
set local request.jwt.claim.sub = '47000000-0000-4000-8000-000000000003';
select public.create_manual_work_order(
  '47000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000002',
  'Trabajo de oficina', 'maintenance', null, null, '',
  '47000000-0000-4000-8000-000000000006'
);
select is((select count(*) from public.clients), 1::bigint,
  'Office owner keeps normal client access');

set local request.jwt.claim.sub = '47000000-0000-4000-8000-000000000004';
select is((select company_name from public.my_company_memberships()),
  'Empresa con técnicos', 'Technician can learn their company name through a narrow RPC');
select is((select role::text from public.my_company_memberships()),
  'technician', 'Session RPC returns the correct technical role');
select is((select count(*) from public.tenants), 0::bigint,
  'Technician cannot read full company settings');
select is((select count(*) from public.clients), 0::bigint,
  'Technician cannot browse company clients');
select is((select count(*) from public.work_orders), 0::bigint,
  'Technician cannot browse all company work orders');
select is((select count(*) from public.profiles), 1::bigint,
  'Technician sees only their own profile, not colleagues');
select is((select count(*) from public.memberships), 1::bigint,
  'Technician sees only their own membership');
select throws_ok(
  $$select public.create_manual_work_order(
    '47000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000002',
    'Trabajo indebido', 'maintenance', null, null, '',
    '47000000-0000-4000-8000-000000000007')$$,
  '42501', 'No tienes permiso para crear trabajos',
  'Technician cannot invoke an office write command');

select * from finish();
rollback;
