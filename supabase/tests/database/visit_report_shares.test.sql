begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into public.tenants (id, name) values
  ('5b000000-0000-4000-8000-000000000001', 'Empresa informes'),
  ('5b000000-0000-4000-8000-000000000002', 'Empresa ajena');
insert into public.clients (id, tenant_id, name) values
  ('5b000000-0000-4000-8000-000000000003',
   '5b000000-0000-4000-8000-000000000001', 'Cliente');
insert into auth.users (id, email) values
  ('5b000000-0000-4000-8000-000000000004', 'owner-share@example.test'),
  ('5b000000-0000-4000-8000-000000000005', 'tech-share@example.test'),
  ('5b000000-0000-4000-8000-000000000006', 'other-share@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('5b000000-0000-4000-8000-000000000001',
   '5b000000-0000-4000-8000-000000000004', 'owner'),
  ('5b000000-0000-4000-8000-000000000001',
   '5b000000-0000-4000-8000-000000000005', 'technician'),
  ('5b000000-0000-4000-8000-000000000002',
   '5b000000-0000-4000-8000-000000000006', 'owner');

set local role authenticated;
set local request.jwt.claim.sub = '5b000000-0000-4000-8000-000000000004';
select set_config('test.share_visit', public.create_service_visit(
  '5b000000-0000-4000-8000-000000000001',
  '5b000000-0000-4000-8000-000000000003', null, null, null,
  'Revisión', '5b000000-0000-4000-8000-000000000005',
  now(), now() + interval '1 hour', 'normal', '',
  '5b000000-0000-4000-8000-000000000007'
)::text, true);
select ok(current_setting('test.share_visit')::uuid is not null,
  'Visit is scheduled');
select is(public.transition_service_visit(
  '5b000000-0000-4000-8000-000000000001',
  current_setting('test.share_visit')::uuid,
  (select updated_at from public.service_visits
    where id = current_setting('test.share_visit')::uuid),
  'in_progress', '', '5b000000-0000-4000-8000-000000000008'),
  'in_progress', 'Visit starts');
select is(public.transition_service_visit(
  '5b000000-0000-4000-8000-000000000001',
  current_setting('test.share_visit')::uuid,
  (select updated_at from public.service_visits
    where id = current_setting('test.share_visit')::uuid),
  'completed', '', '5b000000-0000-4000-8000-000000000009'),
  'completed', 'Visit is closed');
select set_config('test.share_version', (select id::text
  from public.service_visit_report_versions
  where visit_id = current_setting('test.share_visit')::uuid), true);
select set_config('test.share_expiry',
  (now() + interval '7 days')::text, true);
select set_config('test.share_id', public.create_service_visit_report_share(
  '5b000000-0000-4000-8000-000000000001',
  current_setting('test.share_version')::uuid,
  repeat('a', 64), current_setting('test.share_expiry')::timestamptz,
  '5b000000-0000-4000-8000-000000000010'
)::text, true);
select ok(current_setting('test.share_id')::uuid is not null,
  'Owner creates a share');
select isnt((select token_hash from public.service_visit_report_shares),
  repeat('a', 64), 'Bearer token is not stored as plaintext');
select is(public.create_service_visit_report_share(
  '5b000000-0000-4000-8000-000000000001',
  current_setting('test.share_version')::uuid,
  repeat('a', 64), current_setting('test.share_expiry')::timestamptz,
  '5b000000-0000-4000-8000-000000000010'),
  current_setting('test.share_id')::uuid,
  'Create retry returns the same share');
select throws_ok($$select public.create_service_visit_report_share(
  '5b000000-0000-4000-8000-000000000001',
  current_setting('test.share_version')::uuid,
  repeat('b', 64), current_setting('test.share_expiry')::timestamptz,
  '5b000000-0000-4000-8000-000000000010')$$,
  '23505', null, 'Operation key cannot be reused with another token');
select throws_ok($$select public.create_service_visit_report_share(
  '5b000000-0000-4000-8000-000000000001',
  current_setting('test.share_version')::uuid,
  'short', now() + interval '7 days',
  '5b000000-0000-4000-8000-000000000011')$$,
  '22023', null, 'Short bearer token is rejected');
select throws_ok($$select public.create_service_visit_report_share(
  '5b000000-0000-4000-8000-000000000001',
  current_setting('test.share_version')::uuid,
  repeat('c', 64), now() + interval '100 days',
  '5b000000-0000-4000-8000-000000000012')$$,
  '22023', null, 'Link cannot outlive 90 days');

set local request.jwt.claim.sub = '5b000000-0000-4000-8000-000000000005';
select is((select count(*) from public.service_visit_report_shares),
  0::bigint, 'Technician cannot read link metadata');
select throws_ok($$select public.revoke_service_visit_report_share(
  '5b000000-0000-4000-8000-000000000001',
  current_setting('test.share_id')::uuid,
  '5b000000-0000-4000-8000-000000000013')$$,
  '42501', null, 'Technician cannot revoke the link');
set local request.jwt.claim.sub = '5b000000-0000-4000-8000-000000000006';
select is((select count(*) from public.service_visit_report_shares),
  0::bigint, 'Other tenant cannot read link metadata');
set local request.jwt.claim.sub = '5b000000-0000-4000-8000-000000000004';
select is(public.revoke_service_visit_report_share(
  '5b000000-0000-4000-8000-000000000001',
  current_setting('test.share_id')::uuid,
  '5b000000-0000-4000-8000-000000000013'),
  true, 'Owner revokes the link');
select is((select count(*) from public.service_visit_report_shares
  where revoked_at is null), 0::bigint,
  'Revoked link is no longer active');
select is(public.revoke_service_visit_report_share(
  '5b000000-0000-4000-8000-000000000001',
  current_setting('test.share_id')::uuid,
  '5b000000-0000-4000-8000-000000000013'),
  true, 'Revocation retry is idempotent');
select set_config('test.short_expiry',
  (clock_timestamp() + interval '5 seconds')::text, true);
select set_config('test.short_share', public.create_service_visit_report_share(
  '5b000000-0000-4000-8000-000000000001',
  current_setting('test.share_version')::uuid,
  repeat('d', 64), current_setting('test.short_expiry')::timestamptz,
  '5b000000-0000-4000-8000-000000000014')::text, true);
select ok(current_setting('test.short_share')::uuid is not null,
  'Short-lived link is created');
select pg_sleep(5.2);
select is(public.create_service_visit_report_share(
  '5b000000-0000-4000-8000-000000000001',
  current_setting('test.share_version')::uuid,
  repeat('d', 64), current_setting('test.short_expiry')::timestamptz,
  '5b000000-0000-4000-8000-000000000014'),
  current_setting('test.short_share')::uuid,
  'The original operation remains idempotent after the link expires');
select throws_ok($$update public.service_visit_report_shares
  set revoked_at = null$$, '42501', null,
  'Client cannot bypass the revocation command');

select * from finish();
rollback;
