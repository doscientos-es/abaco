begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into public.tenants (id, name) values
  ('91000000-0000-4000-8000-000000000001', 'Empresa inventario');
insert into public.clients (id, tenant_id, name) values
  ('91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'Cliente');
insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000003', 'inventory-fixture@example.test'),
  ('91000000-0000-4000-8000-000000000004', 'inventory-viewer-fixture@example.test'),
  ('91000000-0000-4000-8000-000000000005', 'inventory-platform-fixture@example.test');
insert into public.platform_superadmins (user_id) values ('91000000-0000-4000-8000-000000000005');
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
  ('91000000-0000-4000-8000-000000000021', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'Manual', current_date + 30, false, 'work'),
  ('91000000-0000-4000-8000-000000000022', '91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'Base sin inventario', current_date + 30, false, 'work');
insert into public.estimate_lines (tenant_id, estimate_id, catalog_item_id, kind, unit, quantity) values
  ('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000020', '91000000-0000-4000-8000-000000000010', 'material', 'm', 4),
  ('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000020', '91000000-0000-4000-8000-000000000010', 'material', 'm', 3),
  ('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000020', '91000000-0000-4000-8000-000000000011', 'material', 'm', 2),
  ('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000021', '91000000-0000-4000-8000-000000000010', 'material', 'm', 2),
  ('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000022', '91000000-0000-4000-8000-000000000011', 'material', 'ud', 2);
update public.estimates set status = 'sent' where id in
  ('91000000-0000-4000-8000-000000000020', '91000000-0000-4000-8000-000000000021', '91000000-0000-4000-8000-000000000022');

set local role anon;
select is((select array_agg(code order by code) from public.billing_module_catalog), array['procurement']::text[], 'Public prices do not advertise planned modules');
set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000003';
select ok(not public.can_use_procurement('91000000-0000-4000-8000-000000000001'), 'New tenant has no optional module by default');
select is((select count(*) from public.suppliers where tenant_id = '91000000-0000-4000-8000-000000000001'), 0::bigint, 'REST reads are gated even if data exists');
select is((select count(*) from public.catalog_items where tenant_id = '91000000-0000-4000-8000-000000000001'), 2::bigint, 'The base catalog stays readable');
select throws_ok($$select public.superadmin_set_tenant_module('91000000-0000-4000-8000-000000000001','procurement',true)$$, '42501', 'No autorizado', 'Tenant users cannot grant themselves a module');
select throws_ok($$select public.save_inventory_item('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000010', 5, null, null)$$, '42501', 'Compras e inventario no está activado en esta empresa', 'Stock RPC checks module access');
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000005';
select throws_ok($$select public.superadmin_set_tenant_module('91000000-0000-4000-8000-000000000001','supplier_logistics',true)$$, '22023', 'Módulo no disponible', 'Planned modules cannot be enabled');
select public.superadmin_set_tenant_module('91000000-0000-4000-8000-000000000001','procurement',true);
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000003';
select ok(public.can_use_procurement('91000000-0000-4000-8000-000000000001'), 'Platform activation enables the existing tenant role');
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
select throws_ok($$select public.save_inventory_item('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000010', 10, null, 2)$$, '42501', 'Compras e inventario no está activado en esta empresa', 'Viewer cannot change inventory');

set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000005';
select public.superadmin_set_tenant_module('91000000-0000-4000-8000-000000000001','procurement',false);
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000003';
select is((select count(*) from public.inventory_items where tenant_id = '91000000-0000-4000-8000-000000000001'), 0::bigint, 'Deactivation hides existing stock');
select throws_ok($$select public.resolve_inventory_shortage('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000010')$$, '42501', 'Compras e inventario no está activado en esta empresa', 'Shortage RPC checks module access');
set local role service_role;
update public.estimates set status = 'accepted', responded_at = now(), responded_by = 'Cliente'
  where id = '91000000-0000-4000-8000-000000000022' and status = 'sent';
select is((select status::text from public.estimates where id = '91000000-0000-4000-8000-000000000022'), 'accepted', 'Base estimate acceptance is independent of procurement');
select is((select count(*) from public.inventory_allocations where estimate_id = '91000000-0000-4000-8000-000000000022'), 0::bigint, 'Acceptance while disabled does not allocate stock');
set local role authenticated;
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000005';
select public.superadmin_set_tenant_module('91000000-0000-4000-8000-000000000001','procurement',true);
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000003';
select is((select quantity from public.inventory_items where catalog_item_id = '91000000-0000-4000-8000-000000000011'), 9::numeric, 'Reactivation restores the existing stock unchanged');
select * from finish();
rollback;
