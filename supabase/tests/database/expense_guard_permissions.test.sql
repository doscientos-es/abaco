begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);

select ok(not has_function_privilege('anon',
  'public.protect_allocated_ledger_expense()', 'execute'),
  'Anonymous callers cannot execute the internal expense guard');
select ok(not has_function_privilege('authenticated',
  'public.protect_allocated_ledger_expense()', 'execute'),
  'Signed-in callers cannot execute the internal expense guard directly');

insert into public.tenants(id, name) values
  ('77000000-0000-4000-8000-000000000001', 'Expense guard test');
insert into public.clients(id, tenant_id, name) values
  ('77000000-0000-4000-8000-000000000002',
   '77000000-0000-4000-8000-000000000001', 'Guard client');
insert into auth.users(id, email) values
  ('77000000-0000-4000-8000-000000000003', 'expense-guard@example.test');
insert into public.memberships(tenant_id, user_id, role) values
  ('77000000-0000-4000-8000-000000000001',
   '77000000-0000-4000-8000-000000000003', 'owner');
insert into public.ledger_entries(id, tenant_id, kind, entry_date, concept, amount_cents, vat_rate)
  values ('77000000-0000-4000-8000-000000000004',
    '77000000-0000-4000-8000-000000000001', 'expense', current_date, 'Material', 12100, 21);

set local role authenticated;
set local request.jwt.claim.sub = '77000000-0000-4000-8000-000000000003';
select set_config('test.guard_work', public.create_manual_work_order(
  '77000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000002', 'Guard work', 'repair', null, null, '',
  '77000000-0000-4000-8000-000000000005')::text, true);
select public.allocate_ledger_expense(
  '77000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000004', current_setting('test.guard_work')::uuid,
  null, 12100, null, null, '77000000-0000-4000-8000-000000000006');
select throws_ok($$update public.ledger_entries set concept = 'Changed'
  where id = '77000000-0000-4000-8000-000000000004'$$,
  '23503', 'Anula las imputaciones antes de cambiar el gasto',
  'The trigger still protects allocated expenses on update');
select throws_ok($$delete from public.ledger_entries
  where id = '77000000-0000-4000-8000-000000000004'$$,
  '23503', 'El gasto tiene historial de imputaciones',
  'The trigger still protects allocated expenses on delete');

select * from finish();
rollback;