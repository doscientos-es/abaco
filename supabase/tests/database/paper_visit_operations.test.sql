begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(22);

insert into public.tenants(id, name) values
  ('76000000-0000-4000-8000-000000000001', 'Paper operations test'),
  ('76000000-0000-4000-8000-000000000002', 'Other paper company');
insert into public.clients(id, tenant_id, name) values
  ('76000000-0000-4000-8000-000000000003',
   '76000000-0000-4000-8000-000000000001', 'Paper client');
insert into auth.users(id, email) values
  ('76000000-0000-4000-8000-000000000004', 'paper-admin@example.test'),
  ('76000000-0000-4000-8000-000000000005', 'paper-tech@example.test'),
  ('76000000-0000-4000-8000-000000000006', 'paper-other@example.test');
insert into public.memberships(tenant_id, user_id, role) values
  ('76000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000004', 'admin'),
  ('76000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000005', 'technician'),
  ('76000000-0000-4000-8000-000000000002', '76000000-0000-4000-8000-000000000006', 'admin');

set local role authenticated;
set local request.jwt.claim.sub = '76000000-0000-4000-8000-000000000004';
select set_config('test.paper_visit', public.create_service_visit(
  '76000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000003',
  null, null, null, 'Paper visit', '76000000-0000-4000-8000-000000000005',
  '2026-11-13 08:00+00', '2026-11-13 09:00+00', 'normal', '',
  '76000000-0000-4000-8000-000000000007')::text, true);
select set_config('test.paper_version', (select updated_at from public.service_visits
  where id = current_setting('test.paper_visit')::uuid)::text, true);
select set_config('test.paper_path', '76000000-0000-4000-8000-000000000001/' ||
  current_setting('test.paper_visit') || '/76000000-0000-4000-8000-000000000008', true);

select throws_ok($$select public.update_paper_visit(
  '76000000-0000-4000-8000-000000000001', current_setting('test.paper_visit')::uuid,
  current_setting('test.paper_version')::timestamptz, '{"action":"cancel"}',
  '76000000-0000-4000-8000-000000000009')$$,
  '22023', 'Cambio inválido; la cancelación requiere motivo', 'Cancellation requires a reason');
select public.update_paper_visit(
  '76000000-0000-4000-8000-000000000001', current_setting('test.paper_visit')::uuid,
  current_setting('test.paper_version')::timestamptz,
  '{"action":"cancel","reason":"Cliente ausente"}', '76000000-0000-4000-8000-000000000010');
select is((select status from public.service_visits
  where id = current_setting('test.paper_visit')::uuid), 'canceled', 'Cancellation persists');
select is((select payload->>'reason' from public.service_visit_events
  where operation_id = '76000000-0000-4000-8000-000000000010'),
  'Cliente ausente', 'Cancellation reason is audited');
select is(public.update_paper_visit(
  '76000000-0000-4000-8000-000000000001', current_setting('test.paper_visit')::uuid,
  current_setting('test.paper_version')::timestamptz,
  '{"action":"cancel","reason":"Cliente ausente"}', '76000000-0000-4000-8000-000000000010'),
  current_setting('test.paper_visit')::uuid, 'Cancellation retry is idempotent');
select throws_ok($$select public.update_paper_visit(
  '76000000-0000-4000-8000-000000000001', current_setting('test.paper_visit')::uuid,
  current_setting('test.paper_version')::timestamptz, '{"action":"cancel","reason":"Otro"}',
  '76000000-0000-4000-8000-000000000010')$$,
  '23505', 'Operación utilizada', 'A retry cannot silently change the reason');
select throws_ok($$select public.update_paper_visit(
  '76000000-0000-4000-8000-000000000001', current_setting('test.paper_visit')::uuid,
  current_setting('test.paper_version')::timestamptz, '{"action":"complete","performed_on":"2026-11-13"}',
  '76000000-0000-4000-8000-000000000011')$$,
  'P0409', 'La visita cambió; vuelve a cargarla', 'Stale changes cannot reopen a canceled visit');
select throws_ok($$select public.update_paper_visit(
  '76000000-0000-4000-8000-000000000001', current_setting('test.paper_visit')::uuid,
  (select updated_at from public.service_visits where id = current_setting('test.paper_visit')::uuid),
  '{"action":"complete","performed_on":"2026-11-13"}', '76000000-0000-4000-8000-000000000012')$$,
  'P0409', 'La visita cambió; vuelve a cargarla', 'A canceled visit cannot be completed');

-- Only Storage metadata is inserted: this does not upload a file to object storage.
select lives_ok($$insert into storage.objects(bucket_id, name)
  values ('signed-work-sheets', current_setting('test.paper_path'))$$,
  'Office may insert signed-sheet object metadata after closure');
select lives_ok($$insert into public.visit_signed_documents(id, tenant_id, visit_id, object_path, name)
  values ('76000000-0000-4000-8000-000000000008', '76000000-0000-4000-8000-000000000001',
    current_setting('test.paper_visit')::uuid, current_setting('test.paper_path'), 'Signed sheet.pdf')$$,
  'Office may register an existing signed-sheet object');
select is((select count(*) from public.visit_signed_documents
  where visit_id = current_setting('test.paper_visit')::uuid), 1::bigint, 'Office sees its document');
select is((select count(*) from storage.objects where bucket_id = 'signed-work-sheets'
  and name = current_setting('test.paper_path')), 1::bigint, 'Office sees its storage object');
select throws_ok($$insert into public.visit_signed_documents(id, tenant_id, visit_id, object_path, name)
  values ('76000000-0000-4000-8000-000000000013', '76000000-0000-4000-8000-000000000001',
    current_setting('test.paper_visit')::uuid, '76000000-0000-4000-8000-000000000001/' ||
    current_setting('test.paper_visit') || '/76000000-0000-4000-8000-000000000013', 'Missing.pdf')$$,
  '42501', null, 'Document registration requires an existing object');
select throws_ok($$update public.visit_signed_documents set name = 'Changed.pdf'
  where id = '76000000-0000-4000-8000-000000000008'$$,
  '42501', null, 'Registered evidence cannot be overwritten');

set local request.jwt.claim.sub = '76000000-0000-4000-8000-000000000005';
select is((select count(*) from public.visit_signed_documents
  where visit_id = current_setting('test.paper_visit')::uuid), 0::bigint, 'Technician cannot see office documents');
select is((select count(*) from storage.objects where bucket_id = 'signed-work-sheets'
  and name = current_setting('test.paper_path')), 0::bigint, 'Technician cannot read signed-sheet objects');
select throws_ok($$insert into storage.objects(bucket_id, name)
  values ('signed-work-sheets', current_setting('test.paper_path') || '-tech')$$,
  '42501', null, 'Technician cannot upload office evidence');
select throws_ok($$select public.update_paper_visit(
  '76000000-0000-4000-8000-000000000001', current_setting('test.paper_visit')::uuid,
  null, '{"action":"cancel","reason":"Otro"}', '76000000-0000-4000-8000-000000000014')$$,
  '42501', 'No tienes permiso', 'Technician cannot run office commands');

set local request.jwt.claim.sub = '76000000-0000-4000-8000-000000000006';
select is((select count(*) from public.visit_signed_documents
  where visit_id = current_setting('test.paper_visit')::uuid), 0::bigint, 'Other company cannot see documents');
select is((select count(*) from storage.objects where bucket_id = 'signed-work-sheets'
  and name = current_setting('test.paper_path')), 0::bigint, 'Other company cannot read stored objects');
select throws_ok($$insert into storage.objects(bucket_id, name)
  values ('signed-work-sheets', current_setting('test.paper_path') || '-other')$$,
  '42501', null, 'Other company cannot upload into this visit');
select throws_ok($$select public.update_paper_visit(
  '76000000-0000-4000-8000-000000000001', current_setting('test.paper_visit')::uuid,
  null, '{"action":"cancel","reason":"Otro"}', '76000000-0000-4000-8000-000000000015')$$,
  '42501', 'No tienes permiso', 'Other company cannot change this visit');
select throws_ok($$insert into public.visit_signed_documents(id, tenant_id, visit_id, object_path, name)
  values ('76000000-0000-4000-8000-000000000016', '76000000-0000-4000-8000-000000000001',
    current_setting('test.paper_visit')::uuid, '76000000-0000-4000-8000-000000000001/' ||
    current_setting('test.paper_visit') || '/76000000-0000-4000-8000-000000000016', 'Other.pdf')$$,
  '42501', null, 'Other company cannot register documents');

select * from finish();
rollback;