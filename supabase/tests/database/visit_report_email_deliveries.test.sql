begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select ok((select relrowsecurity from pg_class
  where oid = 'public.service_visit_report_email_deliveries'::regclass),
  'Delivery metadata uses RLS');
select ok(has_column_privilege('authenticated',
  'public.service_visit_report_email_deliveries', 'status', 'SELECT'),
  'Office role can read delivery status');
select ok(not has_column_privilege('authenticated',
  'public.service_visit_report_email_deliveries', 'token_ciphertext', 'SELECT'),
  'Browser cannot read encrypted bearer token');
select ok(not has_column_privilege('anon',
  'public.service_visit_report_email_deliveries', 'recipient_email', 'SELECT'),
  'Anonymous users cannot read recipient data');
select ok(not has_function_privilege('authenticated',
  'public.claim_service_visit_report_email_delivery(uuid)', 'EXECUTE'),
  'Browser cannot claim deliveries');
select is((select public from storage.buckets where id = 'visit-report-pdfs'),
  false, 'PDF bucket remains private');

insert into public.tenants (id, name) values
  ('5c000000-0000-4000-8000-000000000001', 'Empresa correo');
insert into public.clients (id, tenant_id, name, email) values
  ('5c000000-0000-4000-8000-000000000002',
   '5c000000-0000-4000-8000-000000000001', 'Cliente', 'cliente@example.test');
insert into auth.users (id, email) values
  ('5c000000-0000-4000-8000-000000000003', 'owner-email@example.test'),
  ('5c000000-0000-4000-8000-000000000004', 'tech-email@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('5c000000-0000-4000-8000-000000000001',
   '5c000000-0000-4000-8000-000000000003', 'owner'),
  ('5c000000-0000-4000-8000-000000000001',
   '5c000000-0000-4000-8000-000000000004', 'technician');

set local role authenticated;
set local request.jwt.claim.sub = '5c000000-0000-4000-8000-000000000003';
select set_config('test.email_visit', public.create_service_visit(
  '5c000000-0000-4000-8000-000000000001',
  '5c000000-0000-4000-8000-000000000002', null, null, null,
  'Revisión', '5c000000-0000-4000-8000-000000000004',
  now(), now() + interval '1 hour', 'normal', '',
  '5c000000-0000-4000-8000-000000000005'
)::text, true);
select ok(current_setting('test.email_visit')::uuid is not null,
  'Visit exists for the delivery fixture');
do $$
begin
  perform public.transition_service_visit(
    '5c000000-0000-4000-8000-000000000001',
    current_setting('test.email_visit')::uuid,
    (select updated_at from public.service_visits
      where id = current_setting('test.email_visit')::uuid),
    'in_progress', '', '5c000000-0000-4000-8000-000000000006');
  perform public.transition_service_visit(
    '5c000000-0000-4000-8000-000000000001',
    current_setting('test.email_visit')::uuid,
    (select updated_at from public.service_visits
      where id = current_setting('test.email_visit')::uuid),
    'completed', '', '5c000000-0000-4000-8000-000000000007');
end;
$$;

reset role;
select set_config('test.email_version', (select id::text
  from public.service_visit_report_versions
  where visit_id = current_setting('test.email_visit')::uuid), true);
insert into public.service_visit_report_shares (
  id, operation_id, tenant_id, report_version_id, token_hash,
  expires_at, created_by
) values (
  '5c000000-0000-4000-8000-000000000008',
  '5c000000-0000-4000-8000-000000000009',
  '5c000000-0000-4000-8000-000000000001',
  current_setting('test.email_version')::uuid,
  repeat('a', 64), now() + interval '7 days',
  '5c000000-0000-4000-8000-000000000003'
);
insert into public.service_visit_report_email_deliveries (
  id, tenant_id, report_version_id, share_id, token_hash,
  token_ciphertext, token_nonce, recipient_email, recipient_name,
  company_name, sender_name, sender_address, app_url, requested_by
) values (
  '5c000000-0000-4000-8000-000000000010',
  '5c000000-0000-4000-8000-000000000001',
  current_setting('test.email_version')::uuid,
  '5c000000-0000-4000-8000-000000000008', repeat('a', 64),
  'encrypted', 'nonce', 'cliente@example.test', 'Cliente',
  'Empresa correo', 'Empresa correo', 'informes@example.test',
  'https://abaco.example.test', '5c000000-0000-4000-8000-000000000003'
);
select is((select count(*) from public.service_visit_report_email_deliveries),
  1::bigint, 'One durable delivery is queued');

set local role authenticated;
set local request.jwt.claim.sub = '5c000000-0000-4000-8000-000000000004';
select is((select count(*) from public.service_visit_report_email_deliveries),
  0::bigint, 'Technician cannot read customer delivery metadata');
set local request.jwt.claim.sub = '5c000000-0000-4000-8000-000000000003';
select is((select count(*) from public.service_visit_report_email_deliveries),
  1::bigint, 'Owner can read delivery metadata');
reset role;

set local role service_role;
select set_config('test.email_lease', (select lease_token::text
  from public.claim_service_visit_report_email_delivery(
    '5c000000-0000-4000-8000-000000000010')), true);
select is((select attempts from public.service_visit_report_email_deliveries
  where id = '5c000000-0000-4000-8000-000000000010'),
  1, 'First claim records one attempt');
select is((select count(*) from public.claim_service_visit_report_email_delivery(
  '5c000000-0000-4000-8000-000000000010')),
  0::bigint, 'Active lease blocks a second claim');
select is(public.finish_service_visit_report_email_delivery(
  '5c000000-0000-4000-8000-000000000010',
  current_setting('test.email_lease')::uuid, 'retry', null, 'provider_503'),
  true, 'Retryable failure releases the lease');
select is((select status from public.service_visit_report_email_deliveries
  where id = '5c000000-0000-4000-8000-000000000010'),
  'retry', 'Failure is kept for a scheduled retry');
update public.service_visit_report_email_deliveries
  set next_attempt_at = now() - interval '1 minute'
  where id = '5c000000-0000-4000-8000-000000000010';
select set_config('test.email_lease', (select lease_token::text
  from public.claim_service_visit_report_email_delivery(
    '5c000000-0000-4000-8000-000000000010')), true);
select is((select attempts from public.service_visit_report_email_deliveries
  where id = '5c000000-0000-4000-8000-000000000010'),
  2, 'Due retry keeps the same delivery');
select is(public.finish_service_visit_report_email_delivery(
  '5c000000-0000-4000-8000-000000000010',
  current_setting('test.email_lease')::uuid, 'sent', 'provider-id', null),
  true, 'Successful retry finalizes delivery');
select is((select status from public.service_visit_report_email_deliveries
  where id = '5c000000-0000-4000-8000-000000000010'),
  'sent', 'Delivery is terminal after provider acceptance');
select is((select token_ciphertext from public.service_visit_report_email_deliveries
  where id = '5c000000-0000-4000-8000-000000000010'),
  null::text, 'Terminal delivery discards the encrypted bearer');

insert into public.service_visit_report_email_provider_events
  (event_id, provider_message_id, recipient_email, event_type, occurred_at)
values ('msg-report-1', 'provider-id', 'cliente@example.test',
  'email.delivered', now()),
  ('msg-report-unmatched', 'another-provider', 'cliente@example.test',
   'email.bounced', now());
select is((select count(*) from public.service_visit_report_email_provider_events),
  2::bigint, 'Signed provider metadata is stored separately');
insert into public.service_visit_report_email_provider_events
  (event_id, provider_message_id, recipient_email, event_type, occurred_at)
values ('msg-report-1', 'provider-id', 'cliente@example.test',
  'email.delivered', now()) on conflict (event_id) do nothing;
select is((select count(*) from public.service_visit_report_email_provider_events),
  2::bigint, 'Webhook replay does not duplicate an event');
set local role authenticated;
set local request.jwt.claim.sub = '5c000000-0000-4000-8000-000000000004';
select is((select count(*) from public.service_visit_report_email_provider_events),
  0::bigint, 'Technician cannot read report delivery events');
set local request.jwt.claim.sub = '5c000000-0000-4000-8000-000000000003';
select is((select count(*) from public.service_visit_report_email_provider_events),
  1::bigint, 'Owner only sees events linked to their provider delivery');
select ok(not has_column_privilege('anon',
  'public.service_visit_report_email_provider_events', 'recipient_email', 'SELECT'),
  'Anonymous users cannot inspect provider events');

select * from finish();
rollback;
