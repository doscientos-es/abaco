begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create temporary table invoice_fixture as
select gen_random_uuid() as tenant_id, gen_random_uuid() as client_id,
       gen_random_uuid() as estimate_id, gen_random_uuid() as milestone_id,
       gen_random_uuid() as owner_id;

insert into public.tenants (id, name, tax_id)
select tenant_id, 'Emisor original', 'B12345678' from invoice_fixture;
insert into public.clients (id, tenant_id, name, tax_id)
select client_id, tenant_id, 'Cliente original', '12345678Z' from invoice_fixture;
insert into auth.users (id, email)
select owner_id, 'invoice-draft-owner@example.test' from invoice_fixture;
insert into public.memberships (tenant_id, user_id, role)
select tenant_id, owner_id, 'owner' from invoice_fixture;
insert into public.estimates (id, tenant_id, client_id, title, status, valid_until, automatic_contract, conversion_destination)
select estimate_id, tenant_id, client_id, 'Mantenimiento', 'draft', current_date + 30, false, 'work'
from invoice_fixture;
insert into public.estimate_lines
  (tenant_id, estimate_id, description, kind, quantity, unit_price_cents)
select tenant_id, estimate_id, 'Servicio', 'labor', 1, 10000 from invoice_fixture;
insert into public.estimate_milestones
  (id, tenant_id, estimate_id, label, percent)
select milestone_id, tenant_id, estimate_id, 'Señal', 30 from invoice_fixture;

update public.estimates set status = 'sent'
where id = (select estimate_id from invoice_fixture);

select is((select count(*) from public.invoices i
  join invoice_fixture f on f.estimate_id = i.estimate_id), 0::bigint,
  'A sent estimate has no automatically issued invoice');

update public.estimates set status = 'accepted', responded_at = now(), responded_by = 'Cliente'
where id = (select estimate_id from invoice_fixture);

select is((select count(*) from public.invoice_milestone_drafts d
  join invoice_fixture f on f.estimate_id = d.estimate_id), 1::bigint,
  'Public acceptance prepares exactly one first invoice draft');
select is((select count(*) from public.invoices i
  join invoice_fixture f on f.estimate_id = i.estimate_id), 0::bigint,
  'Acceptance does not issue an invoice or consume a number');
select is((select d.total_cents from public.invoice_milestone_drafts d
  join invoice_fixture f on f.estimate_id = d.estimate_id), 3630::bigint,
  'Draft copies the accepted milestone gross amount');

select set_config('test.invoice_tenant', (select tenant_id::text from invoice_fixture), true);
select set_config('test.invoice_owner', (select owner_id::text from invoice_fixture), true);
select set_config('test.invoice_draft', (select id::text
  from public.invoice_milestone_drafts), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.invoice_owner'), true);
update public.tenants set document_library = '{
  "estimates": [], "blocks": [], "defaultEstimateId": null,
  "defaultInvoiceId": "5e000000-0000-4000-8000-000000000002",
  "invoices": [
    {"id":"5e000000-0000-4000-8000-000000000002","name":"Habitual","design":"modern",
      "appearance":{"logoSize":"standard","logoPosition":"auto","accentColor":"","showLogo":true,"showContact":true}},
    {"id":"5e000000-0000-4000-8000-000000000003","name":"Entrega","design":"artistic",
      "appearance":{"logoSize":"large","logoPosition":"right","accentColor":"#123456","showLogo":false,"showContact":false}}
  ]
}'::jsonb where id = current_setting('test.invoice_tenant')::uuid;
select throws_ok(format(
  'select public.issue_invoice_draft_with_template(''milestone'', %L, %L, 1, %L, %L)',
  current_setting('test.invoice_tenant'), current_setting('test.invoice_draft'),
  '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000004'),
  '22023', 'La plantilla de factura ya no está disponible.',
  'A missing template cannot silently fall back to the default');
select set_config('test.issued_invoice', public.issue_invoice_draft_with_template(
  'milestone',
  current_setting('test.invoice_tenant')::uuid,
  current_setting('test.invoice_draft')::uuid, 1,
  '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000003')::text, true);
update public.tenants set document_library = null where id = current_setting('test.invoice_tenant')::uuid;
select is(public.issue_invoice_draft_with_template(
  'milestone',
  current_setting('test.invoice_tenant')::uuid,
  current_setting('test.invoice_draft')::uuid, 1,
  '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000003')::text,
  current_setting('test.issued_invoice'),
  'Retrying the same emission returns the original invoice after template removal');
select throws_ok(
  format('select public.update_invoice_milestone_draft(%L::uuid, %L::uuid, 1, ''Cambio'', current_date + 15)',
    current_setting('test.invoice_tenant'), current_setting('test.invoice_draft')),
  'P0409', 'El borrador cambió o ya se emitió; recarga antes de guardar',
  'An issued draft cannot be edited');
reset role;
select is((select count(*) from public.invoices i
  join invoice_fixture f on f.estimate_id = i.estimate_id), 1::bigint,
  'Authorized office action issues exactly one invoice');
select is((select document_snapshot ->> 'design' from public.invoices
  where id = current_setting('test.issued_invoice')::uuid), 'artistic',
  'Issuance captures the explicit template instead of the company default');
select is((select document_snapshot -> 'appearance' from public.invoices
  where id = current_setting('test.issued_invoice')::uuid),
  '{"logoSize":"large","logoPosition":"right","accentColor":"#123456","showLogo":false,"showContact":false}'::jsonb,
  'The issued appearance survives deletion of the template');

update public.tenants set name = 'Emisor modificado'
where id = (select tenant_id from invoice_fixture);
update public.clients set name = 'Cliente modificado'
where id = (select client_id from invoice_fixture);

select is((select i.document_snapshot->'issuer'->>'name' from public.invoices i
  join invoice_fixture f on f.estimate_id = i.estimate_id), 'Emisor original',
  'Issuer snapshot survives a master record change');

update public.estimates set status = 'accepted'
where id = (select estimate_id from invoice_fixture);
select is((select count(*) from public.invoices i
  join invoice_fixture f on f.estimate_id = i.estimate_id), 1::bigint,
  'Repeating acceptance does not issue another invoice');

select throws_ok(
  'update public.invoices set total_cents = 1 where estimate_id = (select estimate_id from invoice_fixture)',
  'P0001', 'El contenido de una factura emitida es inmutable',
  'Issued invoice content cannot be edited');
select throws_ok(
  'delete from public.invoices where estimate_id = (select estimate_id from invoice_fixture)',
  'P0001', 'Las facturas emitidas no se eliminan; emite una rectificativa',
  'Issued invoices cannot be deleted');
select throws_ok(
  'update public.estimates set title = ''Cambiado'' where id = (select estimate_id from invoice_fixture)',
  'P0001', 'El contenido de un presupuesto enviado es inmutable; crea una copia',
  'Published estimate content cannot be edited');
select throws_ok(
  'update public.estimate_lines set quantity = 2 where estimate_id = (select estimate_id from invoice_fixture)',
  'P0001', 'Las partidas e hitos de un presupuesto enviado son inmutables',
  'Published estimate lines cannot be edited');
select throws_ok(
  'delete from public.estimates where id = (select estimate_id from invoice_fixture)',
  'P0001', 'Un presupuesto enviado o respondido no se elimina',
  'Published estimate cannot be deleted');

select * from finish();
rollback;
