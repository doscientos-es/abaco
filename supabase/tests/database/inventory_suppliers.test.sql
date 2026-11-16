begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.tenants (id, name) values
  ('91000000-0000-4000-8000-000000000001', 'Empresa inventario');
insert into public.clients (id, tenant_id, name) values
  ('91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'Cliente');
insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000003', 'inventory-fixture@example.test'),
  ('91000000-0000-4000-8000-000000000004', 'inventory-viewer-fixture@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000003', 'editor'),
  ('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000004', 'viewer');
insert into public.catalog_items (id, tenant_id, name, kind, unit) values
  ('91000000-0000-4000-8000-000000000010', '91000000-0000-4000-8000-000000000001', 'Tubo', 'material', 'm'),
  ('91000000-0000-4000-8000-000000000011', '91000000-0000-4000-8000-000000000001', 'Pieza', 'material', 'ud');
insert into public.suppliers (id, tenant_id, name, email) values
  ('91000000-0000-4000-8000-000000000012', '91000000-0000-4000-8000-000000000001', 'Proveedor', 'proveedor@example.test');
insert into public.estimates (id, tenant_id, client_id, title, valid_until, automatic_contract, conversion_destination) values
  ('91000000-0000-4000-8000-000000000020', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'Público', current_date + 30, false, 'work'),
  ('91000000-0000-4000-8000-000000000021', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'Manual', current_date + 30, false, 'work');
insert into public.estimate_lines (tenant_id, estimate_id, catalog_item_id, kind, unit, quantity) values
  ('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000020', '91000000-0000-4000-8000-000000000010', 'material', 'm', 4),
  ('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000020', '91000000-0000-4000-8000-000000000010', 'material', 'm', 3),
  ('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000020', '91000000-0000-4000-8000-000000000011', 'material', 'm', 2),
  ('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000021', '91000000-0000-4000-8000-000000000010', 'material', 'm', 2);
update public.estimates set status = 'sent' where id in
  ('91000000-0000-4000-8000-000000000020', '91000000-0000-4000-8000-000000000021');

set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000003';
select public.save_inventory_item('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000010', 5, '91000000-0000-4000-8000-000000000012', null);
select public.save_inventory_item('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000011', 9, null, null);
set local role service_role;
update public.estimates set status = 'accepted', responded_at = now(), responded_by = 'Cliente'
  where id = '91000000-0000-4000-8000-000000000020' and status = 'sent';
set local role authenticated;
select is((select quantity from public.inventory_items where catalog_item_id = '91000000-0000-4000-8000-000000000010'), 0::numeric, 'Public acceptance deducts available stock');
select is((select requested_quantity from public.inventory_allocations where estimate_id = '91000000-0000-4000-8000-000000000020' and catalog_item_id = '91000000-0000-4000-8000-000000000010'), 7::numeric, 'Multiple lines are aggregated');
select is((select missing_quantity from public.inventory_shortages where estimate_id = '91000000-0000-4000-8000-000000000020' and catalog_item_id = '91000000-0000-4000-8000-000000000010'), 2::numeric, 'Shortage is recorded');
select is((select supplier_id from public.inventory_shortages where estimate_id = '91000000-0000-4000-8000-000000000020' and catalog_item_id = '91000000-0000-4000-8000-000000000010'), '91000000-0000-4000-8000-000000000012'::uuid, 'Shortage retains supplier');
select is((select reason from public.inventory_shortages where estimate_id = '91000000-0000-4000-8000-000000000020' and catalog_item_id = '91000000-0000-4000-8000-000000000011'), 'unit_mismatch', 'Mismatched units are flagged');
select is((select quantity from public.inventory_items where catalog_item_id = '91000000-0000-4000-8000-000000000011'), 9::numeric, 'Mismatched units do not consume stock');
select public.accept_estimate_manually('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000021', '91000000-0000-4000-8000-000000000030', 'Cliente prueba', 'Referencia documental prueba');
select public.accept_estimate_manually('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000021', '91000000-0000-4000-8000-000000000030', 'Cliente prueba', 'Referencia documental prueba');
select is((select count(*) from public.inventory_allocations where estimate_id = '91000000-0000-4000-8000-000000000021'), 1::bigint, 'Retrying manual acceptance does not allocate twice');
select throws_ok($$select public.save_inventory_item('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000010', 10, null, 1)$$, 'P0409', 'El stock ha cambiado desde que abriste el formulario', 'Stale stock edits are rejected');
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000004';
select is((select count(*) from public.inventory_items where tenant_id = '91000000-0000-4000-8000-000000000001'), 0::bigint, 'Viewer cannot read inventory');
select throws_ok($$select public.save_inventory_item('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000010', 10, null, 2)$$, '42501', 'No tienes permiso para gestionar el stock', 'Viewer cannot change inventory');
select * from finish();
rollback;