begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into public.tenants (id, name) values
  ('59000000-0000-4000-8000-000000000001', 'Empresa fotografías'),
  ('59000000-0000-4000-8000-000000000002', 'Empresa ajena');
insert into public.clients (id, tenant_id, name)
values ('59000000-0000-4000-8000-000000000003',
  '59000000-0000-4000-8000-000000000001', 'Cliente');
insert into auth.users (id, email) values
  ('59000000-0000-4000-8000-000000000004', 'office-photo@example.test'),
  ('59000000-0000-4000-8000-000000000005', 'tech-photo@example.test'),
  ('59000000-0000-4000-8000-000000000006', 'other-photo@example.test'),
  ('59000000-0000-4000-8000-000000000007', 'foreign-photo@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('59000000-0000-4000-8000-000000000001',
   '59000000-0000-4000-8000-000000000004', 'owner'),
  ('59000000-0000-4000-8000-000000000001',
   '59000000-0000-4000-8000-000000000005', 'technician'),
  ('59000000-0000-4000-8000-000000000001',
   '59000000-0000-4000-8000-000000000006', 'technician'),
  ('59000000-0000-4000-8000-000000000002',
   '59000000-0000-4000-8000-000000000007', 'owner');
select is((select public from storage.buckets where id = 'visit-photos'),
  false, 'Visit photos use a private bucket');

set local role authenticated;
set local request.jwt.claim.sub = '59000000-0000-4000-8000-000000000004';
select set_config('test.photo_visit', public.create_service_visit(
  '59000000-0000-4000-8000-000000000001',
  '59000000-0000-4000-8000-000000000003', null, null, null,
  'Revisión', '59000000-0000-4000-8000-000000000005',
  now(), now() + interval '1 hour', 'normal', '',
  '59000000-0000-4000-8000-000000000008'
)::text, true);
select ok(current_setting('test.photo_visit')::uuid is not null,
  'Office schedules a visit');

set local request.jwt.claim.sub = '59000000-0000-4000-8000-000000000005';
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('visit-photos',
  '59000000-0000-4000-8000-000000000001/' ||
    current_setting('test.photo_visit') ||
    '/59000000-0000-4000-8000-000000000009.jpg',
  '59000000-0000-4000-8000-000000000005',
  '{"mimetype":"image/jpeg","size":1234}'::jsonb);
select is((select count(*) from storage.objects where bucket_id = 'visit-photos'),
  1::bigint, 'Assigned technician can upload a private photo');
select is(public.register_service_visit_photo(
  '59000000-0000-4000-8000-000000000001',
  current_setting('test.photo_visit')::uuid,
  '59000000-0000-4000-8000-000000000009',
  'before', 'Antes de reparar', 'jpg',
  '59000000-0000-4000-8000-000000000010'),
  '59000000-0000-4000-8000-000000000009'::uuid,
  'Technician registers the uploaded object');
select is(public.register_service_visit_photo(
  '59000000-0000-4000-8000-000000000001',
  current_setting('test.photo_visit')::uuid,
  '59000000-0000-4000-8000-000000000009',
  'before', 'Antes de reparar', 'jpg',
  '59000000-0000-4000-8000-000000000010'),
  '59000000-0000-4000-8000-000000000009'::uuid,
  'Registration retry returns the same photo');
select throws_ok($$insert into public.service_visit_photos (
  id, operation_id, tenant_id, visit_id, phase,
  storage_path, created_by
) values ('59000000-0000-4000-8000-000000000011',
  '59000000-0000-4000-8000-000000000012',
  '59000000-0000-4000-8000-000000000001',
  current_setting('test.photo_visit')::uuid, 'after', 'fake',
  '59000000-0000-4000-8000-000000000005')$$,
  '42501', null, 'Metadata cannot bypass the registration command');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('visit-photos',
    '59000000-0000-4000-8000-000000000002/' ||
      current_setting('test.photo_visit') ||
      '/59000000-0000-4000-8000-000000000013.jpg',
    '59000000-0000-4000-8000-000000000005')$$,
  '42501', null, 'A technician cannot upload into another tenant path');

set local request.jwt.claim.sub = '59000000-0000-4000-8000-000000000006';
select is((select count(*) from public.service_visit_photos), 0::bigint,
  'Unassigned technician cannot read photo metadata');
select is((select count(*) from storage.objects where bucket_id = 'visit-photos'),
  0::bigint, 'Unassigned technician cannot read private objects');

set local request.jwt.claim.sub = '59000000-0000-4000-8000-000000000007';
select is((select count(*) from public.service_visit_photos), 0::bigint,
  'Other company cannot read photo metadata');

set local request.jwt.claim.sub = '59000000-0000-4000-8000-000000000004';
select is((select count(*) from public.service_visit_photos), 1::bigint,
  'Office can read photo metadata');
select is(public.transition_service_visit(
  '59000000-0000-4000-8000-000000000001',
  current_setting('test.photo_visit')::uuid,
  (select updated_at from public.service_visits
    where id = current_setting('test.photo_visit')::uuid),
  'in_progress', '', '59000000-0000-4000-8000-000000000014'),
  'in_progress', 'Office starts visit');
select is(public.transition_service_visit(
  '59000000-0000-4000-8000-000000000001',
  current_setting('test.photo_visit')::uuid,
  (select updated_at from public.service_visits
    where id = current_setting('test.photo_visit')::uuid),
  'completed', '', '59000000-0000-4000-8000-000000000015'),
  'completed', 'Completing visit closes photo registration');
select is((select jsonb_array_length(snapshot->'photos')
  from public.service_visit_report_versions
  where visit_id = current_setting('test.photo_visit')::uuid),
  1, 'Closed report contains the registered photo');
select is((select snapshot->'photos'->0->>'caption'
  from public.service_visit_report_versions
  where visit_id = current_setting('test.photo_visit')::uuid),
  'Antes de reparar', 'Closed photo reference preserves its caption');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('visit-photos',
    '59000000-0000-4000-8000-000000000001/' ||
      current_setting('test.photo_visit') ||
      '/59000000-0000-4000-8000-000000000016.jpg',
    '59000000-0000-4000-8000-000000000004')$$,
  '42501', null, 'Closed visit rejects new photo uploads');

select * from finish();
rollback;
