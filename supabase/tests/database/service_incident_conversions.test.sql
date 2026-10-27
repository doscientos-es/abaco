begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into public.tenants (id, name) values
  ('56000000-0000-4000-8000-000000000001', 'Empresa conversiones'),
  ('56000000-0000-4000-8000-000000000002', 'Empresa ajena');
insert into public.clients (id, tenant_id, name) values
  ('56000000-0000-4000-8000-000000000003',
   '56000000-0000-4000-8000-000000000001', 'Cliente');
insert into public.service_locations (id, tenant_id, client_id, name, address)
values ('56000000-0000-4000-8000-000000000004',
  '56000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000003', 'Centro', 'Calle Agua 4');
insert into public.service_assets (id, tenant_id, location_id, kind, name)
values ('56000000-0000-4000-8000-000000000005',
  '56000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000004', 'pool', 'Piscina');
insert into auth.users (id, email) values
  ('56000000-0000-4000-8000-000000000006', 'office-convert@example.test'),
  ('56000000-0000-4000-8000-000000000007', 'tech-convert@example.test'),
  ('56000000-0000-4000-8000-000000000008', 'foreign-convert@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('56000000-0000-4000-8000-000000000001',
   '56000000-0000-4000-8000-000000000006', 'owner'),
  ('56000000-0000-4000-8000-000000000001',
   '56000000-0000-4000-8000-000000000007', 'technician'),
  ('56000000-0000-4000-8000-000000000002',
   '56000000-0000-4000-8000-000000000008', 'owner');

set local role authenticated;
set local request.jwt.claim.sub = '56000000-0000-4000-8000-000000000006';
select set_config('test.convert_incident', public.create_service_incident(
  '56000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000003',
  '56000000-0000-4000-8000-000000000004',
  '56000000-0000-4000-8000-000000000005', null, null,
  'Bomba averiada', 'Fuga de agua', 'high', null, null,
  '56000000-0000-4000-8000-000000000011'
)::text, true);
select ok(current_setting('test.convert_incident')::uuid is not null,
  'Office creates an incident with a physical context');

select set_config('test.convert_estimate', public.convert_service_incident(
  '56000000-0000-4000-8000-000000000001',
  current_setting('test.convert_incident')::uuid, 'estimate',
  null, null, null, '56000000-0000-4000-8000-000000000012'
)::text, true);
select is((select status from public.estimates
  where id = current_setting('test.convert_estimate')::uuid), 'draft',
  'Conversion creates an editable draft estimate');
select is((select sum(percent) from public.estimate_milestones
  where estimate_id = current_setting('test.convert_estimate')::uuid),
  100::numeric, 'Draft milestones total 100 percent');
select is(public.convert_service_incident(
  '56000000-0000-4000-8000-000000000001',
  current_setting('test.convert_incident')::uuid, 'estimate',
  null, null, null, '56000000-0000-4000-8000-000000000012'),
  current_setting('test.convert_estimate')::uuid,
  'The same operation returns the original estimate');
select throws_ok($$select public.convert_service_incident(
  '56000000-0000-4000-8000-000000000001',
  current_setting('test.convert_incident')::uuid, 'estimate',
  null, null, null, '56000000-0000-4000-8000-000000000013')$$,
  'P0409', 'La incidencia ya tiene este destino',
  'Another operation cannot create a second estimate');
select throws_ok($$select public.convert_service_incident(
  '56000000-0000-4000-8000-000000000001',
  current_setting('test.convert_incident')::uuid, 'work',
  null, null, null, '56000000-0000-4000-8000-000000000012')$$,
  '23505', 'La clave de operación ya se utilizó con otros datos',
  'An operation ID cannot be reused for another destination');

select set_config('test.convert_work', public.convert_service_incident(
  '56000000-0000-4000-8000-000000000001',
  current_setting('test.convert_incident')::uuid, 'work',
  null, null, null, '56000000-0000-4000-8000-000000000014'
)::text, true);
select is((select source_snapshot ->> 'origin_kind' from public.work_orders
  where id = current_setting('test.convert_work')::uuid), 'incident',
  'Work retains the incident as its origin');
select is((select asset_id from public.work_orders
  where id = current_setting('test.convert_work')::uuid),
  '56000000-0000-4000-8000-000000000005'::uuid,
  'Work keeps the incident asset');
select is((select payload ->> 'origin_kind' from public.work_order_events
  where work_order_id = current_setting('test.convert_work')::uuid), 'incident',
  'Work creation event records the origin');

select set_config('test.convert_visit', public.convert_service_incident(
  '56000000-0000-4000-8000-000000000001',
  current_setting('test.convert_incident')::uuid, 'visit',
  '2026-11-10 09:00'::timestamp, 90,
  '56000000-0000-4000-8000-000000000007',
  '56000000-0000-4000-8000-000000000015'
)::text, true);
select is((select scheduled_start_at at time zone 'Europe/Madrid'
  from public.service_visits where id = current_setting('test.convert_visit')::uuid),
  '2026-11-10 09:00'::timestamp, 'Visit uses the location local time');
select is((select scheduled_end_at - scheduled_start_at
  from public.service_visits where id = current_setting('test.convert_visit')::uuid),
  interval '90 minutes', 'Visit keeps the requested duration');
select is((select count(*) from public.service_incident_conversions
  where incident_id = current_setting('test.convert_incident')::uuid),
  3::bigint, 'All three destinations are linked to one incident');
select throws_ok($$insert into public.service_incident_conversions (
  operation_id, tenant_id, incident_id, kind, estimate_id, request, actor_id
) values ('56000000-0000-4000-8000-000000000016',
  '56000000-0000-4000-8000-000000000001',
  current_setting('test.convert_incident')::uuid, 'estimate',
  current_setting('test.convert_estimate')::uuid, '{}',
  '56000000-0000-4000-8000-000000000006')$$,
  '42501', null, 'Direct conversion writes are denied');

set local request.jwt.claim.sub = '56000000-0000-4000-8000-000000000007';
select is((select count(*) from public.service_incident_conversions),
  0::bigint, 'Technician cannot read office conversion links');
select throws_ok($$select public.convert_service_incident(
  '56000000-0000-4000-8000-000000000001',
  current_setting('test.convert_incident')::uuid, 'work',
  null, null, null, '56000000-0000-4000-8000-000000000017')$$,
  '42501', 'No tienes permiso para convertir incidencias',
  'Technician cannot convert an incident');

set local request.jwt.claim.sub = '56000000-0000-4000-8000-000000000008';
select throws_ok($$select public.convert_service_incident(
  '56000000-0000-4000-8000-000000000001',
  current_setting('test.convert_incident')::uuid, 'work',
  null, null, null, '56000000-0000-4000-8000-000000000018')$$,
  '42501', 'No tienes permiso para convertir incidencias',
  'Another tenant cannot convert the incident');

set local role postgres;
select throws_ok($$update public.service_incident_conversions
  set incident_id = gen_random_uuid()
  where operation_id = '56000000-0000-4000-8000-000000000012'$$,
  'P0001', 'El historial de trabajos es inmutable',
  'A privileged update cannot rewrite conversion history');
select is((select count(*) from public.estimates
  where id = current_setting('test.convert_estimate')::uuid),
  1::bigint, 'Retries did not duplicate the destination');
select * from finish();
rollback;
