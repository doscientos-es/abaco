begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into public.tenants (id, name) values
  ('46000000-0000-4000-8000-000000000001', 'Empresa factura extra');
insert into public.clients (id, tenant_id, name) values
  ('46000000-0000-4000-8000-000000000002',
    '46000000-0000-4000-8000-000000000001', 'Cliente factura extra');
insert into auth.users (id, email) values
  ('46000000-0000-4000-8000-000000000003', 'owner-extra-invoice@example.test'),
  ('46000000-0000-4000-8000-000000000004', 'editor-extra-invoice@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('46000000-0000-4000-8000-000000000001',
    '46000000-0000-4000-8000-000000000003', 'owner'),
  ('46000000-0000-4000-8000-000000000001',
    '46000000-0000-4000-8000-000000000004', 'editor');

set local role authenticated;
set local request.jwt.claim.sub = '46000000-0000-4000-8000-000000000003';
select set_config('test.invoice_work_id', public.create_manual_work_order(
  '46000000-0000-4000-8000-000000000001',
  '46000000-0000-4000-8000-000000000002',
  'Trabajo facturable', 'installation', null, null, '',
  '46000000-0000-4000-8000-000000000005'
)::text, true);
select set_config('test.pending_extra_id', public.propose_work_extra(
  '46000000-0000-4000-8000-000000000001',
  current_setting('test.invoice_work_id')::uuid,
  'Extra sin aprobar', 1, 'ud', 10000, 5000, 21,
  '46000000-0000-4000-8000-000000000006'
)::text, true);

select throws_ok(
  $$select public.create_invoice_work_extra_draft(
    '46000000-0000-4000-8000-000000000001',
    current_setting('test.pending_extra_id')::uuid)$$,
  'P0409', 'Solo se prepara un extra aprobado con evidencia',
  'Pending extra cannot become an invoice draft');
select ok(not has_table_privilege('authenticated', 'public.invoices', 'INSERT'),
  'Office users cannot bypass approval through direct invoice inserts');
select public.decide_work_extra(
  '46000000-0000-4000-8000-000000000001',
  current_setting('test.pending_extra_id')::uuid,
  'rejected', 'Ana Cliente', 'Correo de rechazo',
  '46000000-0000-4000-8000-000000000008'
);
select throws_ok(
  $$select public.create_invoice_work_extra_draft(
    '46000000-0000-4000-8000-000000000001',
    current_setting('test.pending_extra_id')::uuid)$$,
  'P0409', 'Solo se prepara un extra aprobado con evidencia',
  'Rejected extra cannot become an invoice draft');
select set_config('test.approved_extra_id', public.propose_work_extra(
  '46000000-0000-4000-8000-000000000001',
  current_setting('test.invoice_work_id')::uuid,
  'Sustituir bomba', 2.5, 'h', 4000, 1800, 21,
  '46000000-0000-4000-8000-000000000010'
)::text, true);
select public.decide_work_extra(
  '46000000-0000-4000-8000-000000000001',
  current_setting('test.approved_extra_id')::uuid,
  'approved', 'Ana Cliente', 'Correo recibido y archivado',
  '46000000-0000-4000-8000-000000000011'
);
select throws_ok(
  $$insert into public.invoices (
    tenant_id, work_extra_id, client_id, concept, total_cents, vat_rate, due_date
  ) values (
    '46000000-0000-4000-8000-000000000001',
    current_setting('test.approved_extra_id')::uuid,
    '46000000-0000-4000-8000-000000000002',
    'Importe manipulado', 1, 21, current_date + 15
  )$$,
  '42501', 'permission denied for table invoices',
  'Office users cannot change the approved amount through direct inserts');
select set_config('test.extra_draft_id', public.create_invoice_work_extra_draft(
  '46000000-0000-4000-8000-000000000001',
  current_setting('test.approved_extra_id')::uuid
)::text, true);
select is((select count(*) from public.invoices where work_extra_id =
  current_setting('test.approved_extra_id')::uuid), 0::bigint,
  'Preparing an extra draft does not issue or number an invoice');
select is(public.update_invoice_work_extra_draft(
  '46000000-0000-4000-8000-000000000001',
  current_setting('test.extra_draft_id')::uuid, 1,
  'Extra · Sustituir bomba', current_date + 15), 2,
  'Owner can revise the draft before issue');
select set_config('test.extra_invoice_id', public.issue_invoice_work_extra_draft(
  '46000000-0000-4000-8000-000000000001',
  current_setting('test.extra_draft_id')::uuid, 2,
  '46000000-0000-4000-8000-000000000012'
)::text, true);
select is((select total_cents from public.invoices
  where id = current_setting('test.extra_invoice_id')::uuid), 12100::bigint,
  'Issued invoice captures approved price plus VAT');
select is((select estimate_id from public.invoices
  where id = current_setting('test.extra_invoice_id')::uuid), null::uuid,
  'Extra invoice has no fabricated estimate origin');
select is((select document_snapshot->'extraApproval'->>'customerName'
  from public.invoices where id = current_setting('test.extra_invoice_id')::uuid),
  'Ana Cliente', 'Issued snapshot carries the approval provenance');
select is((select document_snapshot->>'extraDescription'
  from public.invoices where id = current_setting('test.extra_invoice_id')::uuid),
  'Sustituir bomba', 'Issued snapshot carries the full extra description');
select ok((select not (document_snapshot ? 'unitCostCents')
  and not (document_snapshot ? 'plannedCostCents')
  from public.invoices where id = current_setting('test.extra_invoice_id')::uuid),
  'The customer-facing snapshot contains no protected cost');
select ok((select number ~ '^F-[0-9]{4}-[0-9]{3,}$'
  from public.invoices where id = current_setting('test.extra_invoice_id')::uuid),
  'Extra invoice uses the normal company number series');
select is(public.issue_invoice_work_extra_draft(
  '46000000-0000-4000-8000-000000000001',
  current_setting('test.extra_draft_id')::uuid, 2,
  '46000000-0000-4000-8000-000000000012'
)::text, current_setting('test.extra_invoice_id'),
  'Retrying the same issue operation returns the same invoice');
select throws_ok(
  $$select public.issue_invoice_work_extra_draft(
    '46000000-0000-4000-8000-000000000001',
    current_setting('test.extra_draft_id')::uuid, 2,
    '46000000-0000-4000-8000-000000000013')$$,
  'P0409', 'El borrador ya se emitió',
  'A second operation cannot create another invoice for the same extra');
select is((select count(*) from public.invoices where work_extra_id =
  current_setting('test.approved_extra_id')::uuid), 1::bigint,
  'Only one invoice exists for the approved extra');
select throws_ok(
  $$select public.update_invoice_work_extra_draft(
    '46000000-0000-4000-8000-000000000001',
    current_setting('test.extra_draft_id')::uuid, 2,
    'Concepto modificado', current_date + 16)$$,
  'P0409', 'El borrador cambió o ya se emitió; recarga antes de guardar',
  'Issued draft cannot change its due date or concept');
select public.record_invoice_payment(
  current_setting('test.extra_invoice_id')::uuid, 12100,
  current_date, '46000000-0000-4000-8000-000000000016'
);
select is((select category from public.ledger_entries
  where concept like 'F-%' order by created_at desc limit 1),
  'Cobro de trabajo',
  'Payment ledger identifies a work invoice rather than an estimate invoice');

set local request.jwt.claim.sub = '46000000-0000-4000-8000-000000000004';
select throws_ok(
  $$select public.issue_invoice_work_extra_draft(
    '46000000-0000-4000-8000-000000000001',
    current_setting('test.extra_draft_id')::uuid, 2,
    '46000000-0000-4000-8000-000000000015')$$,
  '42501', 'No tienes permiso para emitir facturas',
  'Editor cannot issue an extra invoice');

select * from finish();
rollback;
