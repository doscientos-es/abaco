begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into public.tenants (id, name) values
  ('55000000-0000-4000-8000-000000000001', 'Empresa incidencias'),
  ('55000000-0000-4000-8000-000000000002', 'Empresa ajena');
insert into public.clients (id, tenant_id, name) values
  ('55000000-0000-4000-8000-000000000003',
   '55000000-0000-4000-8000-000000000001', 'Cliente');
insert into public.service_locations (id, tenant_id, client_id, name, address)
values ('55000000-0000-4000-8000-000000000004',
  '55000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000003', 'Centro', 'Calle Agua 4');
insert into public.service_assets (id, tenant_id, location_id, kind, name)
values ('55000000-0000-4000-8000-000000000005',
  '55000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000004', 'pool', 'Piscina');
insert into public.installed_equipment
  (id, tenant_id, asset_id, kind, warranty_ends_at)
values ('55000000-0000-4000-8000-000000000006',
  '55000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000005', 'Bomba', current_date + 30);
insert into auth.users (id, email) values
  ('55000000-0000-4000-8000-000000000007', 'office-incident@example.test'),
  ('55000000-0000-4000-8000-000000000008', 'tech-incident@example.test'),
  ('55000000-0000-4000-8000-000000000009', 'other-tech-incident@example.test'),
  ('55000000-0000-4000-8000-000000000010', 'foreign-incident@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('55000000-0000-4000-8000-000000000001',
   '55000000-0000-4000-8000-000000000007', 'owner'),
  ('55000000-0000-4000-8000-000000000001',
   '55000000-0000-4000-8000-000000000008', 'technician'),
  ('55000000-0000-4000-8000-000000000001',
   '55000000-0000-4000-8000-000000000009', 'technician'),
  ('55000000-0000-4000-8000-000000000002',
   '55000000-0000-4000-8000-000000000010', 'owner');

set local role authenticated;
set local request.jwt.claim.sub = '55000000-0000-4000-8000-000000000007';
select set_config('test.incident_visit', public.create_service_visit(
  '55000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000003',
  '55000000-0000-4000-8000-000000000004',
  '55000000-0000-4000-8000-000000000005', null,
  'Revisión', '55000000-0000-4000-8000-000000000008',
  now(), now() + interval '1 hour', 'normal', '',
  '55000000-0000-4000-8000-000000000011'
)::text, true);
select ok(current_setting('test.incident_visit')::uuid is not null,
  'Office schedules the source visit');
set local role postgres;
select throws_ok(
  $$insert into public.service_incidents (
    creation_operation_id, tenant_id, client_id, source_visit_id,
    title, description, priority, created_by
  ) values (
    '55000000-0000-4000-8000-000000000051',
    '55000000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000003',
    current_setting('test.incident_visit')::uuid,
    'Contexto falso', 'Sin ubicación ni activo', 'normal',
    '55000000-0000-4000-8000-000000000007')$$,
  'P0409', 'La incidencia no coincide con la visita',
  'Database rejects a source visit with mismatched context');
set local role authenticated;

set local request.jwt.claim.sub = '55000000-0000-4000-8000-000000000008';
select set_config('test.incident', public.create_service_incident(
  '55000000-0000-4000-8000-000000000001',
  null, null, null, null, current_setting('test.incident_visit')::uuid,
  'Fuga en impulsión', 'Se observa pérdida en el acople', 'high',
  null, null, '55000000-0000-4000-8000-000000000012'
)::text, true);
select is((select count(*) from public.service_incidents), 1::bigint,
  'Assigned technician creates an incident from the visit');
select is((select asset_id from public.service_incidents
  where id = current_setting('test.incident')::uuid),
  '55000000-0000-4000-8000-000000000005'::uuid,
  'Incident inherits the visit asset');
set local role postgres;
select throws_ok(
  $$update public.service_incidents set source_visit_id = null
    where id = current_setting('test.incident')::uuid$$,
  'P0409', 'El origen de la incidencia es inmutable',
  'Even a privileged write cannot rewrite incident origin');
set local role authenticated;
select is((select assigned_user_id from public.service_incidents
  where id = current_setting('test.incident')::uuid),
  '55000000-0000-4000-8000-000000000008'::uuid,
  'Technician-created incident assigns its author');
select is((select count(*) from public.service_incident_events
  where incident_id = current_setting('test.incident')::uuid), 1::bigint,
  'Assigned technician can read the incident history');
select is(public.create_service_incident(
  '55000000-0000-4000-8000-000000000001',
  null, null, null, null, current_setting('test.incident_visit')::uuid,
  'Fuga en impulsión', 'Se observa pérdida en el acople', 'high',
  null, null, '55000000-0000-4000-8000-000000000012'),
  current_setting('test.incident')::uuid,
  'A retry returns the same incident');
select throws_ok(
  $$select public.create_service_incident(
    '55000000-0000-4000-8000-000000000001',
    '55000000-0000-4000-8000-000000000003', null,
    '55000000-0000-4000-8000-000000000050', null,
    current_setting('test.incident_visit')::uuid,
    'Fuga', 'Pérdida', 'high', null, null,
    '55000000-0000-4000-8000-000000000013')$$,
  'P0409', 'La incidencia no coincide con la visita',
  'Visit context cannot be forged');
select throws_ok(
  $$update public.service_incidents set title = 'Sin historial'
    where id = current_setting('test.incident')::uuid$$,
  '42501', null, 'Technician cannot bypass the command');
select throws_ok(
  $$select public.update_service_incident(
    '55000000-0000-4000-8000-000000000001',
    current_setting('test.incident')::uuid,
    (select updated_at from public.service_incidents
     where id = current_setting('test.incident')::uuid),
    'in_progress', 'urgent', '55000000-0000-4000-8000-000000000008',
    null, 'unassessed', '', 'Inspección', '',
    '55000000-0000-4000-8000-000000000014')$$,
  '42501', 'Solo oficina puede cambiar prioridad, responsable, plazo o cobertura',
  'Technician cannot raise priority');

set local request.jwt.claim.sub = '55000000-0000-4000-8000-000000000009';
select is((select count(*) from public.service_incidents), 0::bigint,
  'Unassigned technician cannot see the incident');
select is((select count(*) from public.service_incident_events), 0::bigint,
  'Unassigned technician cannot see its history');
select throws_ok(
  $$select public.create_service_incident(
    '55000000-0000-4000-8000-000000000001',
    null, null, null, null, current_setting('test.incident_visit')::uuid,
    'Otra', 'Otra descripción', 'normal', null, null,
    '55000000-0000-4000-8000-000000000015')$$,
  '42501', 'No tienes permiso para crear incidencias',
  'Unassigned technician cannot use the visit');

set local request.jwt.claim.sub = '55000000-0000-4000-8000-000000000010';
select is((select count(*) from public.service_incidents), 0::bigint,
  'Another company cannot see incidents');
select throws_ok(
  $$select public.update_service_incident(
    '55000000-0000-4000-8000-000000000001',
    current_setting('test.incident')::uuid, now(),
    'in_progress', 'high', null, null, 'unassessed', '', '', '',
    '55000000-0000-4000-8000-000000000016')$$,
  '42501', 'No tienes permiso para cambiar la incidencia',
  'Another company cannot update an incident');

set local request.jwt.claim.sub = '55000000-0000-4000-8000-000000000007';
select set_config('test.old_version',
  (select updated_at from public.service_incidents
   where id = current_setting('test.incident')::uuid)::text, true);
select is(public.update_service_incident(
  '55000000-0000-4000-8000-000000000001',
  current_setting('test.incident')::uuid,
  current_setting('test.old_version')::timestamptz,
  'in_progress', 'high', '55000000-0000-4000-8000-000000000008',
  now() + interval '1 day', 'warranty', 'Factura equipo y fecha de instalación',
  'Acople defectuoso', '', '55000000-0000-4000-8000-000000000017'),
  current_setting('test.incident')::uuid,
  'Office sets due date, coverage and diagnosis');
select is((select coverage_kind from public.service_incidents
  where id = current_setting('test.incident')::uuid), 'warranty',
  'Coverage decision is stored');
select is(public.update_service_incident(
  '55000000-0000-4000-8000-000000000001',
  current_setting('test.incident')::uuid,
  current_setting('test.old_version')::timestamptz,
  'in_progress', 'high', '55000000-0000-4000-8000-000000000008',
  (select due_at from public.service_incidents
   where id = current_setting('test.incident')::uuid),
  'warranty', 'Factura equipo y fecha de instalación',
  'Acople defectuoso', '', '55000000-0000-4000-8000-000000000017'),
  current_setting('test.incident')::uuid,
  'Retrying an update does not create another event');
select throws_ok(
  $$select public.update_service_incident(
    '55000000-0000-4000-8000-000000000001',
    current_setting('test.incident')::uuid,
    current_setting('test.old_version')::timestamptz,
    'in_progress', 'high', '55000000-0000-4000-8000-000000000008',
    null, 'warranty', 'Factura equipo y fecha de instalación',
    'Acople defectuoso', '', '55000000-0000-4000-8000-000000000018')$$,
  'P0409', 'La incidencia cambió en otra sesión; recarga la ficha',
  'An outdated editor cannot overwrite the incident');
select throws_ok(
  $$update public.service_incident_events set kind = 'updated'
    where operation_id = '55000000-0000-4000-8000-000000000012'$$,
  '42501', null, 'Direct event mutation is denied');

set local request.jwt.claim.sub = '55000000-0000-4000-8000-000000000008';
select is(public.update_service_incident(
  '55000000-0000-4000-8000-000000000001',
  current_setting('test.incident')::uuid,
  (select updated_at from public.service_incidents
   where id = current_setting('test.incident')::uuid),
  'resolved', 'high', '55000000-0000-4000-8000-000000000008',
  (select due_at from public.service_incidents
   where id = current_setting('test.incident')::uuid),
  'warranty', 'Factura equipo y fecha de instalación',
  'Acople defectuoso', 'Se cambió el acople y se probó la bomba',
  '55000000-0000-4000-8000-000000000019'),
  current_setting('test.incident')::uuid,
  'Assigned technician resolves with diagnosis and action');
select is((select status from public.service_incidents
  where id = current_setting('test.incident')::uuid), 'resolved',
  'Incident is resolved');
select throws_ok(
  $$select public.update_service_incident(
    '55000000-0000-4000-8000-000000000001',
    current_setting('test.incident')::uuid,
    (select updated_at from public.service_incidents
     where id = current_setting('test.incident')::uuid),
    'canceled', 'high', '55000000-0000-4000-8000-000000000008',
    null, 'warranty', 'Factura equipo y fecha de instalación',
    'Acople defectuoso', 'No procede',
    '55000000-0000-4000-8000-000000000020')$$,
  '42501', 'Solo oficina puede cambiar prioridad, responsable, plazo o cobertura',
  'Technician cannot cancel an incident');

set local request.jwt.claim.sub = '55000000-0000-4000-8000-000000000007';
select is(public.update_service_incident(
  '55000000-0000-4000-8000-000000000001',
  current_setting('test.incident')::uuid,
  (select updated_at from public.service_incidents
   where id = current_setting('test.incident')::uuid),
  'reopened', 'high', '55000000-0000-4000-8000-000000000008',
  (select due_at from public.service_incidents
   where id = current_setting('test.incident')::uuid),
  'warranty', 'Factura equipo y fecha de instalación',
  'Acople defectuoso', '', '55000000-0000-4000-8000-000000000021'),
  current_setting('test.incident')::uuid,
  'Office reopens after resolution');
select is((select status from public.service_incidents
  where id = current_setting('test.incident')::uuid), 'reopened',
  'Reopened status is visible');
select is((select count(*) from public.service_incident_events
  where incident_id = current_setting('test.incident')::uuid), 4::bigint,
  'Creation, office update, resolution and reopening remain in history');
select * from finish();
rollback;
