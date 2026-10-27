begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.tenants (id, name) values
  ('49000000-0000-4000-8000-000000000001', 'Empresa reprogramación');
insert into public.clients (id, tenant_id, name) values
  ('49000000-0000-4000-8000-000000000002',
    '49000000-0000-4000-8000-000000000001', 'Cliente agenda');
insert into auth.users (id, email) values
  ('49000000-0000-4000-8000-000000000003', 'office-replan@example.test'),
  ('49000000-0000-4000-8000-000000000004', 'tech-replan-1@example.test'),
  ('49000000-0000-4000-8000-000000000005', 'tech-replan-2@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('49000000-0000-4000-8000-000000000001',
    '49000000-0000-4000-8000-000000000003', 'owner'),
  ('49000000-0000-4000-8000-000000000001',
    '49000000-0000-4000-8000-000000000004', 'technician'),
  ('49000000-0000-4000-8000-000000000001',
    '49000000-0000-4000-8000-000000000005', 'technician');

set local role authenticated;
set local request.jwt.claim.sub = '49000000-0000-4000-8000-000000000003';
select set_config('test.replan_one', public.create_service_visit(
  '49000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000002', null, null, null,
  'Primera visita', '49000000-0000-4000-8000-000000000004',
  '2026-10-22 08:00+00', '2026-10-22 09:00+00', 'normal', '',
  '49000000-0000-4000-8000-000000000006'
)::text, true);
select set_config('test.replan_two', public.create_service_visit(
  '49000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000002', null, null, null,
  'Segunda visita', '49000000-0000-4000-8000-000000000005',
  '2026-10-22 11:00+00', '2026-10-22 12:00+00', 'normal', '',
  '49000000-0000-4000-8000-000000000007'
)::text, true);
select is((select count(*) from public.service_visits), 2::bigint,
  'Two visits exist before replanning');
select set_config('test.replan_version', (
  select updated_at from public.service_visits
  where id = current_setting('test.replan_one')::uuid
)::text, true);
select is(public.replan_service_visit_local(
  '49000000-0000-4000-8000-000000000001',
  current_setting('test.replan_one')::uuid,
  current_setting('test.replan_version')::timestamptz,
  '2026-10-22 11:00', 60, '49000000-0000-4000-8000-000000000005',
  'El cliente pidió otra hora', '49000000-0000-4000-8000-000000000008'
), current_setting('test.replan_one')::uuid,
  'Office may move and reassign an unstarted visit');
select is((select scheduled_start_at from public.service_visits
  where id = current_setting('test.replan_one')::uuid),
  '2026-10-22 09:00+00'::timestamptz,
  'Local Madrid time is converted to UTC');
select is((select assigned_user_id from public.service_visits
  where id = current_setting('test.replan_one')::uuid),
  '49000000-0000-4000-8000-000000000005'::uuid,
  'Assignment changed to the second technician');
select is((select payload->>'reason' from public.service_visit_events
  where operation_id = '49000000-0000-4000-8000-000000000008'),
  'El cliente pidió otra hora', 'Immutable event records the reason');
select is(public.replan_service_visit_local(
  '49000000-0000-4000-8000-000000000001',
  current_setting('test.replan_one')::uuid,
  current_setting('test.replan_version')::timestamptz,
  '2026-10-22 11:00', 60, '49000000-0000-4000-8000-000000000005',
  'El cliente pidió otra hora', '49000000-0000-4000-8000-000000000008'
), current_setting('test.replan_one')::uuid,
  'Retry with the same operation key is idempotent');
select throws_ok(
  $$select public.replan_service_visit_local(
    '49000000-0000-4000-8000-000000000001',
    current_setting('test.replan_one')::uuid,
    current_setting('test.replan_version')::timestamptz,
    '2026-10-22 11:00', 60, '49000000-0000-4000-8000-000000000005',
    'Motivo cambiado', '49000000-0000-4000-8000-000000000008')$$,
  '23505', 'La clave de operación ya se utilizó con otros datos',
  'Reusing a key with different content conflicts');
select throws_ok(
  $$select public.replan_service_visit_local(
    '49000000-0000-4000-8000-000000000001',
    current_setting('test.replan_one')::uuid,
    current_setting('test.replan_version')::timestamptz,
    '2026-10-22 12:30', 60, '49000000-0000-4000-8000-000000000005',
    'Nuevo horario', '49000000-0000-4000-8000-000000000009')$$,
  'P0409', 'La visita cambió en otra sesión; recarga la agenda',
  'Stale expected version is rejected');
select throws_ok(
  $$select public.replan_service_visit_local(
    '49000000-0000-4000-8000-000000000001',
    current_setting('test.replan_one')::uuid,
    (select updated_at from public.service_visits
      where id = current_setting('test.replan_one')::uuid),
    '2026-10-22 13:30', 60, '49000000-0000-4000-8000-000000000005',
    'Otro cliente', '49000000-0000-4000-8000-000000000010')$$,
  'P0409', 'El técnico ya tiene una visita en ese horario',
  'Overlap with another visit assigned to the same technician is rejected');
select throws_ok(
  $$select public.replan_service_visit_local(
    '49000000-0000-4000-8000-000000000001',
    current_setting('test.replan_one')::uuid,
    (select updated_at from public.service_visits
      where id = current_setting('test.replan_one')::uuid),
    '2026-10-25 02:30', 60, '49000000-0000-4000-8000-000000000005',
    'Cambio de hora', '49000000-0000-4000-8000-000000000011')$$,
  'P0409', 'La hora local es inexistente o ambigua por cambio de horario',
  'Ambiguous DST hour must be resolved before replanning');
select public.transition_service_visit(
  '49000000-0000-4000-8000-000000000001',
  current_setting('test.replan_one')::uuid,
  (select updated_at from public.service_visits
    where id = current_setting('test.replan_one')::uuid),
  'in_progress', '', '49000000-0000-4000-8000-000000000013'
);
select throws_ok(
  $$select public.replan_service_visit_local(
    '49000000-0000-4000-8000-000000000001',
    current_setting('test.replan_one')::uuid,
    (select updated_at from public.service_visits
      where id = current_setting('test.replan_one')::uuid),
    '2026-10-22 12:00', 60, '49000000-0000-4000-8000-000000000005',
    'Ya iniciada', '49000000-0000-4000-8000-000000000014')$$,
  'P0409', 'Solo se pueden reprogramar visitas pendientes',
  'Started visits keep their original schedule');

set local request.jwt.claim.sub = '49000000-0000-4000-8000-000000000005';
select is((select count(*) from public.service_visit_events), 0::bigint,
  'Technician cannot browse office replanning history');
select throws_ok(
  $$select public.replan_service_visit_local(
    '49000000-0000-4000-8000-000000000001',
    current_setting('test.replan_one')::uuid,
    current_setting('test.replan_version')::timestamptz,
    '2026-10-22 14:00', 60, null,
    'Cambio indebido', '49000000-0000-4000-8000-000000000012')$$,
  '42501', 'No tienes permiso para reprogramar visitas',
  'Technician cannot invoke office replanning');

select * from finish();
rollback;
