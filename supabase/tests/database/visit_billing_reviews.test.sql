begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into public.tenants (id, name) values
  ('5a000000-0000-4000-8000-000000000001', 'Empresa facturación visita'),
  ('5a000000-0000-4000-8000-000000000002', 'Empresa ajena');
insert into public.clients (id, tenant_id, name) values
  ('5a000000-0000-4000-8000-000000000003',
   '5a000000-0000-4000-8000-000000000001', 'Cliente');
insert into auth.users (id, email) values
  ('5a000000-0000-4000-8000-000000000004', 'office-billing-visit@example.test'),
  ('5a000000-0000-4000-8000-000000000005', 'tech-billing-visit@example.test'),
  ('5a000000-0000-4000-8000-000000000006', 'editor-billing-visit@example.test'),
  ('5a000000-0000-4000-8000-000000000007', 'other-billing-visit@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('5a000000-0000-4000-8000-000000000001',
   '5a000000-0000-4000-8000-000000000004', 'owner'),
  ('5a000000-0000-4000-8000-000000000001',
   '5a000000-0000-4000-8000-000000000005', 'technician'),
  ('5a000000-0000-4000-8000-000000000001',
   '5a000000-0000-4000-8000-000000000006', 'editor'),
  ('5a000000-0000-4000-8000-000000000002',
   '5a000000-0000-4000-8000-000000000007', 'owner');

set local role authenticated;
set local request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000004';
select set_config('test.billing_visit', public.create_service_visit(
  '5a000000-0000-4000-8000-000000000001',
  '5a000000-0000-4000-8000-000000000003', null, null, null,
  'Revisión facturable', '5a000000-0000-4000-8000-000000000005',
  now(), now() + interval '1 hour', 'normal', '',
  '5a000000-0000-4000-8000-000000000008'
)::text, true);
select ok(current_setting('test.billing_visit')::uuid is not null,
  'Office schedules the visit');
select is(public.transition_service_visit(
  '5a000000-0000-4000-8000-000000000001',
  current_setting('test.billing_visit')::uuid,
  (select updated_at from public.service_visits
    where id = current_setting('test.billing_visit')::uuid),
  'in_progress', '', '5a000000-0000-4000-8000-000000000009'),
  'in_progress', 'Office starts the visit');
set local request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000005';
select is(public.transition_service_visit(
  '5a000000-0000-4000-8000-000000000001',
  current_setting('test.billing_visit')::uuid,
  (select updated_at from public.service_visits
    where id = current_setting('test.billing_visit')::uuid),
  'completed', '', '5a000000-0000-4000-8000-000000000010'),
  'completed', 'Assigned technician completes the visit');
set local request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000004';
select is((select count(*) from public.service_visit_billing_reviews),
  1::bigint, 'Closing creates one billing review');
select is((select source_kind from public.service_visit_billing_reviews),
  'standalone', 'Standalone visit has its own source kind');
select is((select status from public.service_visit_billing_reviews),
  'pending', 'No automatic invoice decision is made');
select is((select count(*) from public.invoices), 0::bigint,
  'Closing does not emit an invoice');

set local request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000005';
select is((select count(*) from public.service_visit_billing_reviews),
  0::bigint, 'Technician cannot read billing reviews');
set local request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000006';
select is((select count(*) from public.service_visit_billing_reviews),
  0::bigint, 'Legacy editor cannot read billing reviews');
select throws_ok($$select public.decide_service_visit_billing_review(
  '5a000000-0000-4000-8000-000000000001',
  current_setting('test.billing_visit')::uuid,
  'bill_separately', 'Extra acordado',
  '5a000000-0000-4000-8000-000000000011')$$,
  '42501', null, 'Legacy editor cannot make financial decisions');

set local request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000004';
select is(public.decide_service_visit_billing_review(
  '5a000000-0000-4000-8000-000000000001',
  current_setting('test.billing_visit')::uuid,
  'bill_separately', 'Extra acordado',
  '5a000000-0000-4000-8000-000000000011'),
  'bill_separately', 'Owner marks the visit for separate billing');
select is(public.decide_service_visit_billing_review(
  '5a000000-0000-4000-8000-000000000001',
  current_setting('test.billing_visit')::uuid,
  'bill_separately', 'Extra acordado',
  '5a000000-0000-4000-8000-000000000011'),
  'bill_separately', 'Retry returns the original decision');
select is((select count(*) from public.service_visit_billing_review_events),
  1::bigint, 'Retry creates no duplicate audit event');
select throws_ok($$select public.decide_service_visit_billing_review(
  '5a000000-0000-4000-8000-000000000001',
  current_setting('test.billing_visit')::uuid,
  'included', 'Cambio de criterio',
  '5a000000-0000-4000-8000-000000000011')$$,
  '23505', null, 'Reusing an operation with other input conflicts');
select throws_ok($$update public.service_visit_billing_reviews
  set status = 'included'$$, '42501', null,
  'Client cannot bypass the decision command');
set local request.jwt.claim.sub = '5a000000-0000-4000-8000-000000000007';
select is((select count(*) from public.service_visit_billing_reviews),
  0::bigint, 'Other tenant cannot read the review');

select * from finish();
rollback;
