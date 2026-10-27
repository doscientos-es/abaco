begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into public.tenants (id, name) values
  ('20000000-0000-4000-8000-000000000001', 'Piscinas Norte'),
  ('20000000-0000-4000-8000-000000000002', 'Piscinas Sur');
insert into public.clients (id, tenant_id, name) values
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Cliente A'),
  ('20000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', 'Cliente B');
insert into public.service_locations (id, tenant_id, client_id, name, address) values
  ('20000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000003', 'Casa A', 'Calle Norte 1'),
  ('20000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000004', 'Casa B', 'Calle Sur 2');
insert into public.service_assets (id, tenant_id, location_id, kind, name) values
  ('20000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000005', 'generic', 'Depuradora');
insert into public.installed_equipment (id, tenant_id, asset_id, kind) values
  ('20000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000007', 'Bomba');
insert into public.installed_equipment_costs (equipment_id, tenant_id, cost_cents) values
  ('20000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001', 9000);

insert into auth.users (id, email) values
  ('20000000-0000-4000-8000-000000000009', 'editor-passport@example.test'),
  ('20000000-0000-4000-8000-000000000010', 'owner-passport@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000009', 'editor'),
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000010', 'owner');

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000009';

select is((select count(*) from public.service_locations), 1::bigint,
  'An editor sees locations only from their company');
select lives_ok(
  $$update public.clients set archived_at = now()
    where id = '20000000-0000-4000-8000-000000000003'$$,
  'Archiving a client preserves the row and its related records');
select throws_ok(
  $$delete from public.clients
    where id = '20000000-0000-4000-8000-000000000003'$$,
  '42501', 'permission denied for table clients',
  'An editor cannot delete a client directly');
select lives_ok(
  $$insert into public.client_contacts (tenant_id, client_id, name, role)
    values ('20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000003', 'Marta', 'primary')$$,
  'An editor can add a contact for their client');
select lives_ok(
  $$select public.create_pool_asset('20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000005', 'Piscina principal', 45, 'Sal',
    'community', 'outdoor', 10, 5, 1.5, 'Gresite', 'Mayo a septiembre')$$,
  'An editor can create a pool and its profile atomically');
select is((select count(*) from public.pool_profiles), 1::bigint,
  'The pool profile exists after creation');
select is((select length_m from public.pool_profiles), 10::numeric,
  'The pool profile stores its measurements');
select is((select count(*) from public.service_asset_history), 3::bigint,
  'Creating assets and the pool profile records immutable history');
select is((select count(*) from public.installed_equipment_history), 1::bigint,
  'Creating equipment records its initial state');
select lives_ok(
  $$update public.installed_equipment set asset_id = (
      select id from public.service_assets where name = 'Piscina principal'
    ) where id = '20000000-0000-4000-8000-000000000008'$$,
  'An editor can transfer equipment to another asset in the same company');
select is((select count(*) from public.installed_equipment_history
  where asset_id = '20000000-0000-4000-8000-000000000007'), 2::bigint,
  'The former asset retains the transfer event');
select is((select count(*) from public.installed_equipment_history
  where asset_id = (select id from public.service_assets where name = 'Piscina principal')),
  1::bigint, 'The destination asset receives the transfer event');
select lives_ok(
  $$update public.service_assets set status = 'out_of_season'
    where id = '20000000-0000-4000-8000-000000000007'$$,
  'An editor can change an asset lifecycle state');
select is((select count(*) from public.service_asset_history), 4::bigint,
  'A status transition adds a history event');
select set_config('test.pool_id', (
  select id::text from public.service_assets where name = 'Piscina principal'
), true);
select set_config('test.pool_asset_version', (
  select updated_at::text from public.service_assets
  where id = current_setting('test.pool_id')::uuid
), true);
select set_config('test.pool_profile_version', (
  select updated_at::text from public.pool_profiles
  where asset_id = current_setting('test.pool_id')::uuid
), true);
select lives_ok(
  $$select public.update_pool_asset('20000000-0000-4000-8000-000000000001',
    current_setting('test.pool_id')::uuid, 'Piscina renovada', 50, 'Bromo',
    current_setting('test.pool_asset_version')::timestamptz,
    current_setting('test.pool_profile_version')::timestamptz,
    'community', 'indoor', 12, 5, 1.6, 'Lámina', 'Todo el año')$$,
  'Pool name and measurements update together');
select is((select volume_m3 from public.pool_profiles
  where asset_id = current_setting('test.pool_id')::uuid), 50::numeric,
  'The profile reflects the new volume');
select is((select pool_kind from public.pool_profiles
  where asset_id = current_setting('test.pool_id')::uuid), 'indoor',
  'The profile reflects the new type');
select is((select count(*) from public.service_asset_history), 6::bigint,
  'Changing pool measurements and name records both changes');
select throws_ok(
  $$select public.update_pool_asset('20000000-0000-4000-8000-000000000001',
    current_setting('test.pool_id')::uuid, 'Versión obsoleta', 55, 'Cloro',
    current_setting('test.pool_asset_version')::timestamptz,
    current_setting('test.pool_profile_version')::timestamptz)$$,
  'P0409', 'La piscina cambió en otra sesión; recarga la ficha',
  'A stale edit is rejected instead of overwriting newer data');
select set_config('test.old_equipment_version', (
  select updated_at::text from public.installed_equipment
  where id = '20000000-0000-4000-8000-000000000008'
), true);
select lives_ok(
  $$select public.replace_installed_equipment('20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000008',
    current_setting('test.old_equipment_version')::timestamptz,
    'Bomba nueva', 'Acme', 'X2', 'SER-2', current_date + 365,
    'Proveedor Norte', current_date, 'Potencia 2 CV', 'Instalada por el equipo')$$,
  'Replacing equipment keeps the former unit and installs the new one atomically');
select is((select supplier from public.installed_equipment
  where replaces_equipment_id = '20000000-0000-4000-8000-000000000008'),
  'Proveedor Norte', 'The replacement retains its supplier in the technical passport');
select is((select status from public.installed_equipment
  where id = '20000000-0000-4000-8000-000000000008'), 'replaced',
  'The former unit is marked as replaced');
select is((select count(*) from public.installed_equipment
  where replaces_equipment_id = '20000000-0000-4000-8000-000000000008'), 1::bigint,
  'Exactly one successor points to the former unit');
select throws_ok(
  $$update public.installed_equipment set status = 'active'
    where id = '20000000-0000-4000-8000-000000000008'$$,
  'P0001', 'La relación de sustitución no se modifica directamente',
  'A replaced unit cannot be reactivated');
select throws_ok(
  $$update public.installed_equipment set kind = 'Bomba modificada'
    where id = '20000000-0000-4000-8000-000000000008'$$,
  'P0001', 'La relación de sustitución no se modifica directamente',
  'A replaced unit cannot be rewritten after replacement');
select throws_ok(
  $$select public.replace_installed_equipment('20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000008',
    current_setting('test.old_equipment_version')::timestamptz,
    'Duplicado', '', '', '', null)$$,
  'P0409', 'El equipo cambió en otra sesión; recarga la ficha',
  'Repeating a stale replacement cannot create a second successor');
select throws_ok(
  $$select public.create_pool_asset('20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000006', 'Piscina ajena', 30, 'Cloro')$$,
  '22023', 'La piscina requiere una ubicación de servicio',
  'An editor cannot create a pool in another company');
select is((select count(*) from public.installed_equipment_costs), 0::bigint,
  'Internal equipment cost is not visible to an editor');

set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000010';
select is((select count(*) from public.installed_equipment_costs), 1::bigint,
  'The owner can see internal equipment cost');

set local role postgres;
select throws_ok(
  $$delete from public.service_asset_history$$,
  'P0001', 'El historial de instalaciones no se modifica ni elimina',
  'History cannot be deleted even by a privileged table role');

select * from finish();
rollback;
