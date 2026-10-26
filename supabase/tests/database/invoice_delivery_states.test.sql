begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.tenants (id, name) values
  ('55000000-0000-4000-8000-000000000001', 'Estados factura');
insert into public.clients (id, tenant_id, name) values
  ('55000000-0000-4000-8000-000000000002',
   '55000000-0000-4000-8000-000000000001', 'Cliente');
insert into public.estimates (id, tenant_id, client_id, title, valid_until) values
  ('55000000-0000-4000-8000-000000000003',
   '55000000-0000-4000-8000-000000000001',
   '55000000-0000-4000-8000-000000000002', 'Servicio', current_date + 30);
insert into public.estimate_milestones (id, tenant_id, estimate_id, label, percent) values
  ('55000000-0000-4000-8000-000000000004',
   '55000000-0000-4000-8000-000000000001',
   '55000000-0000-4000-8000-000000000003', 'Entrega', 100);
insert into public.invoices (
  id, tenant_id, estimate_id, milestone_id, client_id,
  concept, total_cents, vat_rate, due_date
) values (
  '55000000-0000-4000-8000-000000000005',
  '55000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000003',
  '55000000-0000-4000-8000-000000000004',
  '55000000-0000-4000-8000-000000000002',
  'Servicio', 12100, 21, current_date + 15
);
select is((select status from public.invoices
  where id = '55000000-0000-4000-8000-000000000005'), 'issued',
  'Document begins in issued state');
select is((select email_accepted_at from public.invoices
  where id = '55000000-0000-4000-8000-000000000005'), null::timestamptz,
  'Issued document has no delivery event yet');

insert into public.invoice_delivery_events (
  tenant_id, invoice_id, event_type, recipient_email, resend_email_id
) values (
  '55000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000005',
  'accepted', 'cliente@example.test', 're_delivery_550'
);
select ok((select email_accepted_at is not null from public.invoices
  where id = '55000000-0000-4000-8000-000000000005'),
  'Accepted delivery event projects its timestamp');
select is((select status from public.invoices
  where id = '55000000-0000-4000-8000-000000000005'), 'issued',
  'Email acceptance does not replace documentary issuance');
select is((select count(*) from public.invoice_delivery_events
  where invoice_id = '55000000-0000-4000-8000-000000000005'), 1::bigint,
  'Delivery evidence is retained separately');

insert into auth.users (id, email) values
  ('55000000-0000-4000-8000-000000000006', 'owner-delivery@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('55000000-0000-4000-8000-000000000001',
   '55000000-0000-4000-8000-000000000006', 'owner');
set local role authenticated;
set local request.jwt.claim.sub = '55000000-0000-4000-8000-000000000006';
select public.record_invoice_payment(
  '55000000-0000-4000-8000-000000000005', 12100, current_date,
  '55000000-0000-4000-8000-000000000007'
);
select is((select status from public.invoices
  where id = '55000000-0000-4000-8000-000000000005'), 'issued',
  'Full payment does not replace documentary issuance');
select is((select paid_cents from public.invoices
  where id = '55000000-0000-4000-8000-000000000005'), 12100::bigint,
  'The settlement remains independently measurable');

select * from finish();
rollback;
