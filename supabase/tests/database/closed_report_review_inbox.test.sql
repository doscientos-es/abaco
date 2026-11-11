begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.tenants (id, name, subscription_status) values
  ('88000000-0000-4000-8000-000000000001', 'Empresa A', 'active'),
  ('88000000-0000-4000-8000-000000000002', 'Empresa B', 'active');
insert into auth.users (id, email) values
  ('88000000-0000-4000-8000-000000000003', 'review-admin-a@example.test'),
  ('88000000-0000-4000-8000-000000000004', 'review-user-a@example.test'),
  ('88000000-0000-4000-8000-000000000005', 'review-admin-b@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('88000000-0000-4000-8000-000000000001', '88000000-0000-4000-8000-000000000003', 'admin'),
  ('88000000-0000-4000-8000-000000000001', '88000000-0000-4000-8000-000000000004', 'user'),
  ('88000000-0000-4000-8000-000000000002', '88000000-0000-4000-8000-000000000005', 'admin');
insert into public.clients (id, tenant_id, name) values
  ('88000000-0000-4000-8000-000000000006', '88000000-0000-4000-8000-000000000001', 'Cliente A'),
  ('88000000-0000-4000-8000-000000000007', '88000000-0000-4000-8000-000000000002', 'Cliente B');
insert into public.service_visits
  (id, operation_id, tenant_id, client_id, title, scheduled_start_at, scheduled_end_at, created_by)
values
  ('88000000-0000-4000-8000-000000000008', '88000000-0000-4000-8000-000000000010',
   '88000000-0000-4000-8000-000000000001', '88000000-0000-4000-8000-000000000006',
   'Visita A', now(), now() + interval '1 hour', '88000000-0000-4000-8000-000000000003'),
  ('88000000-0000-4000-8000-000000000009', '88000000-0000-4000-8000-000000000011',
   '88000000-0000-4000-8000-000000000002', '88000000-0000-4000-8000-000000000007',
   'Visita B', now(), now() + interval '1 hour', '88000000-0000-4000-8000-000000000005');
insert into public.service_visit_report_versions (id, tenant_id, visit_id, snapshot) values
  ('88000000-0000-4000-8000-000000000012', '88000000-0000-4000-8000-000000000001',
   '88000000-0000-4000-8000-000000000008', '{"visit":{"title":"Visita A"},"client":{"name":"Cliente A"}}'),
  ('88000000-0000-4000-8000-000000000013', '88000000-0000-4000-8000-000000000002',
   '88000000-0000-4000-8000-000000000009', '{"visit":{"title":"Visita B"},"client":{"name":"Cliente B"}}');
insert into storage.objects (bucket_id, name) values
  ('visit-report-pdfs', '88000000-0000-4000-8000-000000000001/88000000-0000-4000-8000-000000000012.pdf'),
  ('visit-report-pdfs', '88000000-0000-4000-8000-000000000002/88000000-0000-4000-8000-000000000013.pdf');

set local role authenticated;
set local request.jwt.claim.sub = '88000000-0000-4000-8000-000000000003';
select is((select count(*) from public.list_pending_visit_report_reviews(
  '88000000-0000-4000-8000-000000000001')), 1::bigint, 'Admin sees their pending report');
select is((select client_name from public.list_pending_visit_report_reviews(
  '88000000-0000-4000-8000-000000000001')), 'Cliente A', 'Inbox uses the immutable snapshot');
select is((select count(*) from storage.objects where bucket_id = 'visit-report-pdfs'),
  1::bigint, 'Admin can read only their company PDF');
select throws_ok($$select * from public.list_pending_visit_report_reviews(
  '88000000-0000-4000-8000-000000000002')$$, '42501', null, 'Admin cannot list another company');
select throws_ok($$select public.review_closed_visit_report(
  '88000000-0000-4000-8000-000000000001', '88000000-0000-4000-8000-000000000013')$$,
  'P0002', null, 'A foreign report cannot be reviewed');
select throws_ok($$insert into public.service_visit_report_reviews
  (report_version_id, tenant_id, reviewed_by) values
  ('88000000-0000-4000-8000-000000000012', '88000000-0000-4000-8000-000000000001',
   '88000000-0000-4000-8000-000000000003')$$, '42501', null, 'Direct inserts are forbidden');
select is(public.review_closed_visit_report('88000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000012'), true, 'Admin explicitly reviews report');
select is(public.review_closed_visit_report('88000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000012'), true, 'Review retries are idempotent');
select is((select count(*) from public.service_visit_report_reviews), 1::bigint, 'One review is recorded');
select is((select count(*) from public.list_pending_visit_report_reviews(
  '88000000-0000-4000-8000-000000000001')), 0::bigint, 'Reviewed report leaves the inbox');
set local request.jwt.claim.sub = '88000000-0000-4000-8000-000000000004';
select throws_ok($$select * from public.list_pending_visit_report_reviews(
  '88000000-0000-4000-8000-000000000001')$$, '42501', null, 'Worker cannot list inbox');
select throws_ok($$select public.review_closed_visit_report(
  '88000000-0000-4000-8000-000000000001', '88000000-0000-4000-8000-000000000012')$$,
  '42501', null, 'Worker cannot mark reports reviewed');
select is((select count(*) from storage.objects where bucket_id = 'visit-report-pdfs'),
  0::bigint, 'Worker cannot download PDFs through office policy');
select * from finish();
rollback;
