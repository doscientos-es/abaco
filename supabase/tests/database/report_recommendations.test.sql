begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.tenants (id, name)
values ('58000000-0000-4000-8000-000000000001', 'Empresa recomendaciones');
insert into public.clients (id, tenant_id, name)
values ('58000000-0000-4000-8000-000000000002',
  '58000000-0000-4000-8000-000000000001', 'Cliente');
insert into auth.users (id, email)
values ('58000000-0000-4000-8000-000000000003', 'reports-v2@example.test');
insert into public.memberships (tenant_id, user_id, role)
values ('58000000-0000-4000-8000-000000000001',
  '58000000-0000-4000-8000-000000000003', 'owner');

set local role authenticated;
set local request.jwt.claim.sub = '58000000-0000-4000-8000-000000000003';
select set_config('test.recommendation_visit', public.create_service_visit(
  '58000000-0000-4000-8000-000000000001',
  '58000000-0000-4000-8000-000000000002', null, null, null,
  'Revisión', null, now(), now() + interval '1 hour',
  'normal', '', '58000000-0000-4000-8000-000000000004'
)::text, true);
select ok(current_setting('test.recommendation_visit')::uuid is not null,
  'Office creates a visit');
select is(public.save_service_visit_report(
  '58000000-0000-4000-8000-000000000001',
  current_setting('test.recommendation_visit')::uuid, 0,
  '{"notes":"Borrador antiguo","checklist":[]}'::jsonb,
  '58000000-0000-4000-8000-000000000005'), 1::bigint,
  'Previous report shape remains accepted');
select is(public.save_service_visit_report(
  '58000000-0000-4000-8000-000000000001',
  current_setting('test.recommendation_visit')::uuid, 0,
  '{"notes":"Borrador antiguo","checklist":[]}'::jsonb,
  '58000000-0000-4000-8000-000000000005'), 1::bigint,
  'An old operation can still be retried');
select is(public.save_service_visit_report(
  '58000000-0000-4000-8000-000000000001',
  current_setting('test.recommendation_visit')::uuid, 1,
  '{"notes":"Bomba revisada","checklist":[],"recommendations":"Vigilar la presión","next_actions":"Revisar en un mes"}'::jsonb,
  '58000000-0000-4000-8000-000000000006'), 2::bigint,
  'New revision records recommendations and next actions');
select is((select data->>'recommendations' from public.service_visit_reports
  where visit_id = current_setting('test.recommendation_visit')::uuid),
  'Vigilar la presión', 'Recommendation persists');
select is((select data->>'next_actions' from public.service_visit_reports
  where visit_id = current_setting('test.recommendation_visit')::uuid),
  'Revisar en un mes', 'Next action persists');
select throws_ok($$select public.save_service_visit_report(
  '58000000-0000-4000-8000-000000000001',
  current_setting('test.recommendation_visit')::uuid, 2,
  '{"notes":"X","checklist":[],"recommendations":4}'::jsonb,
  '58000000-0000-4000-8000-000000000007')$$,
  '22023', 'Datos del parte inválidos',
  'Recommendation must be text');
select throws_ok($$select public.save_service_visit_report(
  '58000000-0000-4000-8000-000000000001',
  current_setting('test.recommendation_visit')::uuid, 2,
  jsonb_build_object('notes', 'X', 'checklist', '[]'::jsonb,
    'next_actions', repeat('x', 2001)),
  '58000000-0000-4000-8000-000000000008')$$,
  '22023', 'Datos del parte inválidos',
  'Next action length is bounded');
select is(public.transition_service_visit(
  '58000000-0000-4000-8000-000000000001',
  current_setting('test.recommendation_visit')::uuid,
  (select updated_at from public.service_visits
    where id = current_setting('test.recommendation_visit')::uuid),
  'in_progress', '', '58000000-0000-4000-8000-000000000009'),
  'in_progress', 'Visit starts');
select is(public.transition_service_visit(
  '58000000-0000-4000-8000-000000000001',
  current_setting('test.recommendation_visit')::uuid,
  (select updated_at from public.service_visits
    where id = current_setting('test.recommendation_visit')::uuid),
  'completed', '', '58000000-0000-4000-8000-000000000010'),
  'completed', 'Visit closes');
select is((select snapshot #>> '{report,data,recommendations}'
  from public.service_visit_report_versions
  where visit_id = current_setting('test.recommendation_visit')::uuid),
  'Vigilar la presión', 'Closed version retains the recommendation');

select * from finish();
rollback;
