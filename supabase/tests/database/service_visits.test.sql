begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.tenants (id, name) values
  ('48000000-0000-4000-8000-000000000001', 'Empresa visitas');
insert into public.clients (id, tenant_id, name) values
  ('48000000-0000-4000-8000-000000000002',
    '48000000-0000-4000-8000-000000000001', 'Cliente de visita');
insert into public.service_locations (
  id, tenant_id, client_id, name, address
) values (
  '48000000-0000-4000-8000-000000000003',
  '48000000-0000-4000-8000-000000000001',
  '48000000-0000-4000-8000-000000000002',
  'Piscina comunitaria', 'Calle del Agua 4'
);
insert into auth.users (id, email) values
  ('48000000-0000-4000-8000-000000000004', 'office-visits@example.test'),
  ('48000000-0000-4000-8000-000000000005', 'tech-visits-1@example.test'),
  ('48000000-0000-4000-8000-000000000006', 'tech-visits-2@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('48000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000004', 'owner'),
  ('48000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000005', 'technician'),
  ('48000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000006', 'technician');

set local role authenticated;
set local request.jwt.claim.sub = '48000000-0000-4000-8000-000000000004';
select set_config('test.visit_one', public.create_service_visit(
  '48000000-0000-4000-8000-000000000001',
  '48000000-0000-4000-8000-000000000002',
  '48000000-0000-4000-8000-000000000003', null, null,
  'Revisión de piscina', '48000000-0000-4000-8000-000000000005',
  '2026-10-22 08:00+00', '2026-10-22 09:00+00', 'normal',
  'Comprobar depuradora', '48000000-0000-4000-8000-000000000007'
)::text, true);
select is((select count(*) from public.service_visits), 1::bigint,
  'Office schedules one visit');
select is(public.create_service_visit(
  '48000000-0000-4000-8000-000000000001',
  '48000000-0000-4000-8000-000000000002',
  '48000000-0000-4000-8000-000000000003', null, null,
  'Revisión de piscina', '48000000-0000-4000-8000-000000000005',
  '2026-10-22 08:00+00', '2026-10-22 09:00+00', 'normal',
  'Comprobar depuradora', '48000000-0000-4000-8000-000000000007'
)::text, current_setting('test.visit_one'),
  'Creating with the same operation key returns the same visit');
select throws_ok(
  $$select public.create_service_visit(
    '48000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000002',
    '48000000-0000-4000-8000-000000000003', null, null,
    'Visita solapada', '48000000-0000-4000-8000-000000000005',
    '2026-10-22 08:30+00', '2026-10-22 09:30+00', 'normal', '',
    '48000000-0000-4000-8000-000000000008')$$,
  'P0409', 'El técnico ya tiene una visita en ese horario',
  'Office cannot double-book one technician');
select set_config('test.visit_two', public.create_service_visit(
  '48000000-0000-4000-8000-000000000001',
  '48000000-0000-4000-8000-000000000002',
  '48000000-0000-4000-8000-000000000003', null, null,
  'Otra revisión', '48000000-0000-4000-8000-000000000006',
  '2026-10-22 08:30+00', '2026-10-22 09:30+00', 'high', '',
  '48000000-0000-4000-8000-000000000009'
)::text, true);
select is((select count(*) from public.service_visits), 2::bigint,
  'Different technicians may work at overlapping times');
select is((select count(*) from public.service_visit_events), 2::bigint,
  'Each created visit has one immutable event');
select throws_ok(
  $$select public.create_service_visit_local(
    '48000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000002',
    '48000000-0000-4000-8000-000000000003', null, null,
    'Hora de primavera', null, '2026-03-29 02:30',
    'Europe/Madrid', 60, 'normal', '',
    '48000000-0000-4000-8000-000000000015')$$,
  'P0409', 'La hora local es inexistente o ambigua por cambio de horario',
  'Spring clock jump rejects a nonexistent local time');
select throws_ok(
  $$select public.create_service_visit_local(
    '48000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000002',
    '48000000-0000-4000-8000-000000000003', null, null,
    'Hora de otoño', null, '2026-10-25 02:30',
    'Europe/Madrid', 60, 'normal', '',
    '48000000-0000-4000-8000-000000000016')$$,
  'P0409', 'La hora local es inexistente o ambigua por cambio de horario',
  'Autumn clock change rejects an ambiguous local time');
select set_config('test.dst_visit', public.create_service_visit_local(
    '48000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000002',
    '48000000-0000-4000-8000-000000000003', null, null,
    'Hora válida', null, '2026-03-30 09:00',
    'Europe/Madrid', 60, 'normal', '',
    '48000000-0000-4000-8000-000000000017')::text, true);
select is((select scheduled_start_at from public.service_visits
  where id = current_setting('test.dst_visit')::uuid),
  '2026-03-30 07:00+00'::timestamptz,
  'Valid Madrid summer time is stored as UTC');

set local request.jwt.claim.sub = '48000000-0000-4000-8000-000000000005';
select is((select count(*) from public.service_visits), 1::bigint,
  'Technician sees only their assigned visit through RLS');
select is((select count(*) from public.my_assigned_visits(
  '48000000-0000-4000-8000-000000000001',
  '2026-10-22', '2026-10-22'
)), 1::bigint, 'Narrow agenda projection contains only the assigned visit');
select is((select address from public.my_assigned_visits(
  '48000000-0000-4000-8000-000000000001',
  '2026-10-22', '2026-10-22'
)), 'Calle del Agua 4', 'Assigned technician receives the needed service address');
select is((select timezone from public.my_assigned_visits(
  '48000000-0000-4000-8000-000000000001',
  '2026-10-22', '2026-10-22'
)), 'Europe/Madrid', 'Visit projection carries the location time zone');
select is((select count(*) from public.clients), 0::bigint,
  'Agenda projection does not grant broad client access');
select set_config('test.visit_one_version', (
  select updated_at from public.service_visits
  where id = current_setting('test.visit_one')::uuid
)::text, true);
select is(public.transition_service_visit(
  '48000000-0000-4000-8000-000000000001',
  current_setting('test.visit_one')::uuid,
  current_setting('test.visit_one_version')::timestamptz,
  'in_progress', '', '48000000-0000-4000-8000-000000000010'
), 'in_progress', 'Assigned technician can start their visit');
select is(public.transition_service_visit(
  '48000000-0000-4000-8000-000000000001',
  current_setting('test.visit_one')::uuid,
  current_setting('test.visit_one_version')::timestamptz,
  'in_progress', '', '48000000-0000-4000-8000-000000000010'
), 'in_progress', 'Retrying the same transition is idempotent');
select throws_ok(
  $$select public.transition_service_visit(
    '48000000-0000-4000-8000-000000000001',
    current_setting('test.visit_one')::uuid,
    (select updated_at from public.service_visits
      where id = current_setting('test.visit_one')::uuid),
    'canceled', 'Sin tiempo',
    '48000000-0000-4000-8000-000000000011')$$,
  '42501', 'Solo oficina puede omitir o cancelar visitas',
  'Technician cannot cancel their own visit');
select is(public.transition_service_visit(
  '48000000-0000-4000-8000-000000000001',
  current_setting('test.visit_one')::uuid,
  (select updated_at from public.service_visits
    where id = current_setting('test.visit_one')::uuid),
  'completed', '', '48000000-0000-4000-8000-000000000012'
), 'completed', 'Assigned technician can complete their visit');
select ok((select actual_end_at is not null from public.service_visits
  where id = current_setting('test.visit_one')::uuid),
  'Completion records actual end time');

set local request.jwt.claim.sub = '48000000-0000-4000-8000-000000000006';
select throws_ok(
  $$select public.transition_service_visit(
    '48000000-0000-4000-8000-000000000001',
    current_setting('test.visit_one')::uuid,
    current_setting('test.visit_one_version')::timestamptz,
    'completed', '', '48000000-0000-4000-8000-000000000013')$$,
  '42501', 'No tienes permiso para cambiar la visita',
  'Another technician cannot mutate someone else’s visit');
select throws_ok(
  $$select public.create_service_visit(
    '48000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000002',
    '48000000-0000-4000-8000-000000000003', null, null,
    'Visita indebida', null,
    '2026-10-23 08:00+00', '2026-10-23 09:00+00', 'normal', '',
    '48000000-0000-4000-8000-000000000014')$$,
  '42501', 'No tienes permiso para planificar visitas',
  'Technician cannot plan office visits');

select * from finish();
rollback;
