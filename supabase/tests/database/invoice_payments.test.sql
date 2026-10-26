begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.tenants (id, name) values
  ('10000000-0000-4000-8000-000000000001', 'Cobros Test');
insert into public.clients (id, tenant_id, name) values
  ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Cliente');
insert into public.estimates (id, tenant_id, client_id, title, status, valid_until) values
  ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002', 'Servicio', 'draft', current_date + 30);
insert into public.estimate_lines
  (tenant_id, estimate_id, description, kind, quantity, unit_price_cents) values
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003',
   'Servicio', 'labor', 1, 10000);
insert into public.estimate_milestones (id, tenant_id, estimate_id, label, percent) values
  ('10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000003', 'Señal', 30);
update public.estimates set status = 'sent'
where id = '10000000-0000-4000-8000-000000000003';
update public.estimates set status = 'accepted', responded_at = now()
where id = '10000000-0000-4000-8000-000000000003';

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000005', 'owner-payment@example.test'),
  ('10000000-0000-4000-8000-000000000006', 'viewer-payment@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'owner'),
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'viewer');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000005';
select set_config('test.invoice_id', public.issue_invoice_milestone_draft(
  '10000000-0000-4000-8000-000000000001',
  (select id from public.invoice_milestone_drafts
    where estimate_id = '10000000-0000-4000-8000-000000000003'),
  1, '10000000-0000-4000-8000-000000000010'
)::text, true);

select lives_ok(
  $$select public.record_invoice_payment(current_setting('test.invoice_id')::uuid,
    1000, current_date, '10000000-0000-4000-8000-000000000007')$$,
  'Owner can record a partial payment');
select is((select paid_cents from public.invoices
  where id = current_setting('test.invoice_id')::uuid), 1000::bigint,
  'Invoice balance changes once');
select lives_ok(
  $$select public.record_invoice_payment(current_setting('test.invoice_id')::uuid,
    1000, current_date, '10000000-0000-4000-8000-000000000007')$$,
  'Repeating the operation is accepted');
select is((select count(*) from public.invoice_payment_operations
  where invoice_id = current_setting('test.invoice_id')::uuid), 1::bigint,
  'Repeating the operation does not create another payment');
select throws_ok(
  $$select public.record_invoice_payment(current_setting('test.invoice_id')::uuid,
    5000, current_date, '10000000-0000-4000-8000-000000000008')$$,
  '22003', 'El cobro supera el saldo pendiente',
  'Overpayment is rejected');
select lives_ok(
  $$select public.record_invoice_payment(current_setting('test.invoice_id')::uuid,
    2630, current_date, '10000000-0000-4000-8000-000000000011')$$,
  'Owner can settle the remaining balance');
select is((select status from public.invoices
  where id = current_setting('test.invoice_id')::uuid), 'issued',
  'Settlement preserves the issued document status');

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000006';
select throws_ok(
  $$select public.record_invoice_payment(current_setting('test.invoice_id')::uuid,
    500, current_date, '10000000-0000-4000-8000-000000000009')$$,
  '42501', 'No tienes permiso para registrar cobros',
  'Viewer cannot record payments');

select * from finish();
rollback;
