begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.tenants (id,name,collect_visit_start_location) values
  ('49000000-0000-4000-8000-000000000001','Ubicación opcional',true),
  ('49000000-0000-4000-8000-000000000008','Sin ubicación',false);
insert into public.clients (id,tenant_id,name) values
  ('49000000-0000-4000-8000-000000000002','49000000-0000-4000-8000-000000000001','Cliente');
insert into public.service_locations(id,tenant_id,client_id,name,address) values
  ('49000000-0000-4000-8000-000000000003','49000000-0000-4000-8000-000000000001',
   '49000000-0000-4000-8000-000000000002','Centro','Calle 1');
insert into auth.users(id,email) values
  ('49000000-0000-4000-8000-000000000004','owner-location@example.test'),
  ('49000000-0000-4000-8000-000000000005','tech-location@example.test');
insert into public.memberships(tenant_id,user_id,role) values
  ('49000000-0000-4000-8000-000000000001','49000000-0000-4000-8000-000000000004','owner'),
  ('49000000-0000-4000-8000-000000000001','49000000-0000-4000-8000-000000000005','technician');

set local role authenticated;
set local request.jwt.claim.sub = '49000000-0000-4000-8000-000000000004';
select is((select collect_visit_start_location from public.my_company_memberships()
  where tenant_id='49000000-0000-4000-8000-000000000001'),true,
  'Company setting is exposed only in the caller membership projection');
select set_config('test.loc_visit',public.create_service_visit(
  '49000000-0000-4000-8000-000000000001','49000000-0000-4000-8000-000000000002',
  '49000000-0000-4000-8000-000000000003',null,null,'Visita con ubicación',
  '49000000-0000-4000-8000-000000000005','2026-11-12 08:00+00','2026-11-12 09:00+00',
  'normal','','49000000-0000-4000-8000-000000000009')::text,true);
set local request.jwt.claim.sub = '49000000-0000-4000-8000-000000000005';
select set_config('test.loc_version',(select updated_at from public.service_visits
  where id=current_setting('test.loc_visit')::uuid)::text,true);
select throws_ok($$select public.transition_service_visit(
  '49000000-0000-4000-8000-000000000001',current_setting('test.loc_visit')::uuid,
  current_setting('test.loc_version')::timestamptz,'in_progress','','49000000-0000-4000-8000-000000000010')$$,
  '22023','La empresa requiere ubicación al iniciar esta visita',
  'Required company location cannot be bypassed');
select is(public.transition_service_visit(
  '49000000-0000-4000-8000-000000000001',current_setting('test.loc_visit')::uuid,
  current_setting('test.loc_version')::timestamptz,'in_progress','','49000000-0000-4000-8000-000000000011',
  41.3874,2.1686),'in_progress','Assigned technician can start with coordinates');
select is((select actual_start_latitude from public.service_visits
  where id=current_setting('test.loc_visit')::uuid),41.3874::double precision,
  'Latitude is stored with the actual start');
select is((select actual_start_longitude from public.service_visits
  where id=current_setting('test.loc_visit')::uuid),2.1686::double precision,
  'Longitude is stored with the actual start');
select is((select payload->>'startLatitude' from public.service_visit_events
  where operation_id='49000000-0000-4000-8000-000000000011'),'41.3874',
  'Coordinates are included in the idempotent start event');
select throws_ok($$select public.transition_service_visit(
  '49000000-0000-4000-8000-000000000001',current_setting('test.loc_visit')::uuid,
  current_setting('test.loc_version')::timestamptz,'in_progress','','49000000-0000-4000-8000-000000000011',
  91,2)$$,'23505','La clave de operación ya se utilizó con otros datos',
  'Operation retry cannot change its coordinates');
select throws_ok($$select public.transition_service_visit(
  '49000000-0000-4000-8000-000000000001',current_setting('test.loc_visit')::uuid,
  current_setting('test.loc_version')::timestamptz,'completed','','49000000-0000-4000-8000-000000000012',
  41,2)$$,'22023','No se admite ubicación para este cambio',
  'Coordinates cannot be supplied on completion');
select throws_ok($$update public.service_visits set actual_start_latitude=91
  where id=current_setting('test.loc_visit')::uuid$$,'23514',null,
  'Database constraint rejects invalid coordinates');

select * from finish();
rollback;
