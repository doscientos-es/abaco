begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.tenants(id, name) values
  ('a2000000-0000-4000-8000-000000000001', 'Empresa A'),
  ('a2000000-0000-4000-8000-000000000002', 'Empresa B');
insert into auth.users(id, email) values
  ('a2000000-0000-4000-8000-000000000003', 'client-types-admin@example.test'),
  ('a2000000-0000-4000-8000-000000000004', 'client-types-user@example.test');
insert into public.memberships(tenant_id, user_id, role) values
  ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003', 'admin'),
  ('a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000004', 'user');
insert into public.client_types(id, tenant_id, value, label, position) values
  ('a2000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000001', 'hotel', 'Hotel', 4),
  ('a2000000-0000-4000-8000-000000000006', 'a2000000-0000-4000-8000-000000000002', 'foreign', 'Otro', 4);
insert into public.clients(id, tenant_id, name, kind, archived_at) values
  ('a2000000-0000-4000-8000-000000000007', 'a2000000-0000-4000-8000-000000000001', 'Cliente archivado', 'hotel', now());

set local role authenticated;
set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000003';
select is((select count(*) from public.client_types), 4::bigint, 'Admin sees only their company types, including defaults');
select throws_ok($$delete from public.client_types where value = 'hotel'$$, '23503', null,
  'An archived client prevents deletion of its type');
select lives_ok($$update public.client_types set label = 'Hoteles' where value = 'hotel'$$,
  'Renaming preserves the stable client type value');
select is((select kind from public.clients where id = 'a2000000-0000-4000-8000-000000000007'), 'hotel',
  'Renaming does not alter existing clients');
select throws_ok($$insert into public.clients(tenant_id, name, kind)
  values ('a2000000-0000-4000-8000-000000000001', 'Invalido', 'foreign')$$,
  '23503', null, 'Clients cannot use types belonging to another company');
select throws_ok($$insert into public.client_types(tenant_id, value, label)
  values ('a2000000-0000-4000-8000-000000000001', 'duplicate', 'hoteles')$$,
  '23505', null, 'Type names are unique ignoring case');
select lives_ok($$select public.move_client_type('a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000005', -1)$$, 'Admin can reorder the list');
select is((select value from public.client_types order by position, id offset 2 limit 1), 'hotel',
  'Moving up changes the order');
select lives_ok($$delete from public.client_types where value = 'community'$$,
  'An unused type can be deleted');
select lives_ok($$delete from public.client_types where value = 'person'$$,
  'An unused default type can also be deleted');
select lives_ok($$insert into public.clients(tenant_id, name)
  values ('a2000000-0000-4000-8000-000000000001', 'Sin tipo explícito')$$,
  'A client without an explicit type uses the first remaining type');
select is((select kind from public.clients where name = 'Sin tipo explícito'), 'hotel',
  'Implicit client types follow the configured order');
select throws_ok($$update public.client_types set value = 'modified' where value = 'hotel'$$,
  '42501', null, 'Stable values cannot be changed');

set local request.jwt.claim.sub = 'a2000000-0000-4000-8000-000000000004';
select is((select count(*) from public.client_types), 0::bigint, 'A non-admin cannot read configuration');
select throws_ok($$insert into public.client_types(tenant_id, value, label)
  values ('a2000000-0000-4000-8000-000000000001', 'test', 'Test')$$,
  '42501', null, 'A non-admin cannot create types');
select throws_ok($$select public.move_client_type('a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000005', -1)$$,
  '42501', null, 'A non-admin cannot reorder types');
select * from finish();
rollback;
