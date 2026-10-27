begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select ok((select relrowsecurity from pg_class
  where oid = 'public.service_visit_report_pdf_jobs'::regclass),
  'PDF jobs use RLS');
select ok(not has_function_privilege('authenticated',
  'public.claim_service_visit_report_pdf_job()', 'EXECUTE'),
  'Browser cannot claim PDF jobs');
select ok(not has_column_privilege('authenticated',
  'public.service_visit_report_pdf_jobs', 'lease_token', 'SELECT'),
  'Browser cannot inspect the worker lease');

insert into public.tenants (id, name) values
  ('5d000000-0000-4000-8000-000000000001', 'Empresa PDF');
insert into public.clients (id, tenant_id, name) values
  ('5d000000-0000-4000-8000-000000000002',
   '5d000000-0000-4000-8000-000000000001', 'Cliente');
insert into auth.users (id, email) values
  ('5d000000-0000-4000-8000-000000000003', 'owner-pdf@example.test'),
  ('5d000000-0000-4000-8000-000000000004', 'tech-pdf@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('5d000000-0000-4000-8000-000000000001',
   '5d000000-0000-4000-8000-000000000003', 'owner'),
  ('5d000000-0000-4000-8000-000000000001',
   '5d000000-0000-4000-8000-000000000004', 'technician');

set local role authenticated;
set local request.jwt.claim.sub = '5d000000-0000-4000-8000-000000000003';
select set_config('test.pdf_visit', public.create_service_visit(
  '5d000000-0000-4000-8000-000000000001',
  '5d000000-0000-4000-8000-000000000002', null, null, null,
  'Revisión', '5d000000-0000-4000-8000-000000000004',
  now(), now() + interval '1 hour', 'normal', '',
  '5d000000-0000-4000-8000-000000000005'
)::text, true);
do $$
begin
  perform public.transition_service_visit(
    '5d000000-0000-4000-8000-000000000001',
    current_setting('test.pdf_visit')::uuid,
    (select updated_at from public.service_visits
      where id = current_setting('test.pdf_visit')::uuid),
    'in_progress', '', '5d000000-0000-4000-8000-000000000006');
  perform public.transition_service_visit(
    '5d000000-0000-4000-8000-000000000001',
    current_setting('test.pdf_visit')::uuid,
    (select updated_at from public.service_visits
      where id = current_setting('test.pdf_visit')::uuid),
    'completed', '', '5d000000-0000-4000-8000-000000000007');
end;
$$;
select is((select count(*) from public.service_visit_report_pdf_jobs),
  1::bigint, 'Closing the report queues one PDF in the same transaction');
reset role;

select set_config('test.pdf_version', (select report_version_id::text
  from public.service_visit_report_pdf_jobs), true);
set local role authenticated;
set local request.jwt.claim.sub = '5d000000-0000-4000-8000-000000000004';
select is((select count(*) from public.service_visit_report_pdf_jobs),
  0::bigint, 'Technician cannot inspect office PDF jobs');
set local request.jwt.claim.sub = '5d000000-0000-4000-8000-000000000003';
select is((select status from public.service_visit_report_pdf_jobs
  where report_version_id = current_setting('test.pdf_version')::uuid),
  'queued', 'Owner can see a queued PDF');
reset role;

set local role service_role;
select set_config('test.pdf_lease', (select lease_token::text
  from public.claim_service_visit_report_pdf_job()), true);
select is((select attempts from public.service_visit_report_pdf_jobs
  where report_version_id = current_setting('test.pdf_version')::uuid),
  1, 'Claim records the first render attempt');
select is((select count(*) from public.claim_service_visit_report_pdf_job()),
  0::bigint, 'A live lease prevents duplicate rendering');
select is(public.finish_service_visit_report_pdf_job(
  current_setting('test.pdf_version')::uuid,
  current_setting('test.pdf_lease')::uuid, false, 'source_unavailable'),
  true, 'Failed render releases its lease');
select is((select status from public.service_visit_report_pdf_jobs
  where report_version_id = current_setting('test.pdf_version')::uuid),
  'retry', 'Failed render remains queued for retry');
update public.service_visit_report_pdf_jobs
  set next_attempt_at = now() - interval '1 minute'
  where report_version_id = current_setting('test.pdf_version')::uuid;
select set_config('test.pdf_lease', (select lease_token::text
  from public.claim_service_visit_report_pdf_job()), true);
select is((select attempts from public.service_visit_report_pdf_jobs
  where report_version_id = current_setting('test.pdf_version')::uuid),
  2, 'Due retry keeps the same job');
select is(public.finish_service_visit_report_pdf_job(
  current_setting('test.pdf_version')::uuid,
  current_setting('test.pdf_lease')::uuid, true, null),
  true, 'Successful render finishes the job');
select is((select status from public.service_visit_report_pdf_jobs
  where report_version_id = current_setting('test.pdf_version')::uuid),
  'ready', 'PDF job has terminal ready state');
select ok((select ready_at is not null from public.service_visit_report_pdf_jobs
  where report_version_id = current_setting('test.pdf_version')::uuid),
  'Ready timestamp is persisted');
select ok(not has_function_privilege('anon',
  'public.retry_failed_service_visit_report_pdf_job(uuid,uuid)', 'EXECUTE'),
  'Anonymous user cannot retry a failed PDF');
update public.service_visit_report_pdf_jobs
  set status = 'failed', ready_at = null, attempts = 8
  where report_version_id = current_setting('test.pdf_version')::uuid;
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '5d000000-0000-4000-8000-000000000003';
select is(public.retry_failed_service_visit_report_pdf_job(
  '5d000000-0000-4000-8000-000000000001',
  current_setting('test.pdf_version')::uuid),
  true, 'Owner can request another attempt after a terminal failure');
select is((select status from public.service_visit_report_pdf_jobs
  where report_version_id = current_setting('test.pdf_version')::uuid),
  'queued', 'Manual retry returns the same job to the queue');

select * from finish();
rollback;
