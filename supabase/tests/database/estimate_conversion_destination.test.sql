begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.tenants (id, name) values
  ('51000000-0000-4000-8000-000000000001', 'Empresa conversión');
insert into public.clients (id, tenant_id, name) values
  ('51000000-0000-4000-8000-000000000002',
   '51000000-0000-4000-8000-000000000001', 'Comunidad conversión');
insert into public.service_locations
  (id, tenant_id, client_id, name, address, timezone) values
  ('51000000-0000-4000-8000-000000000003',
   '51000000-0000-4000-8000-000000000001',
   '51000000-0000-4000-8000-000000000002',
   'Piscina', 'Calle Sol 3', 'Europe/Madrid');
insert into public.estimates
  (id, tenant_id, client_id, title, valid_until,
   conversion_destination, contract_billing_frequency, discount_type, discount_value)
values
  ('51000000-0000-4000-8000-000000000004',
   '51000000-0000-4000-8000-000000000001',
   '51000000-0000-4000-8000-000000000002',
   'Mantenimiento anual', current_date + 30, 'contract', 'quarterly', 'percent', 10),
  ('51000000-0000-4000-8000-000000000005',
   '51000000-0000-4000-8000-000000000001',
   '51000000-0000-4000-8000-000000000002',
   'Reparación puntual', current_date + 30, 'work', 'monthly', 'none', 0);
insert into public.estimate_lines
  (tenant_id, estimate_id, description, kind, quantity, unit_price_cents)
values
  ('51000000-0000-4000-8000-000000000001',
   '51000000-0000-4000-8000-000000000004',
   'Visitas periódicas', 'labor', 2, 10000),
  ('51000000-0000-4000-8000-000000000001',
   '51000000-0000-4000-8000-000000000005',
   'Reparación', 'labor', 1, 8000);
insert into public.estimate_milestones
  (tenant_id, estimate_id, label, percent)
values
  ('51000000-0000-4000-8000-000000000001',
   '51000000-0000-4000-8000-000000000004',
   'Señal de la plantilla', 30),
  ('51000000-0000-4000-8000-000000000001',
   '51000000-0000-4000-8000-000000000005',
   'Señal de la obra', 30);
update public.estimates set status = 'sent'
where id in ('51000000-0000-4000-8000-000000000004',
             '51000000-0000-4000-8000-000000000005');
select is((select snapshot #>> '{estimate,conversion_destination}'
  from public.estimate_publications
  where estimate_id = '51000000-0000-4000-8000-000000000004'),
  'contract', 'Published snapshot records the chosen destination');
select is((select snapshot #>> '{estimate,contract_billing_frequency}'
  from public.estimate_publications
  where estimate_id = '51000000-0000-4000-8000-000000000004'),
  'quarterly', 'Published snapshot records the agreed billing period');
select throws_ok(
  $$update public.estimates set conversion_destination = 'work'
    where id = '51000000-0000-4000-8000-000000000004'$$,
  'El contenido de un presupuesto enviado es inmutable; crea una copia',
  'Destination cannot change after publication');
update public.estimates set status = 'accepted', responded_at = now(),
  responded_by = 'Cliente firmante'
where id in ('51000000-0000-4000-8000-000000000004',
             '51000000-0000-4000-8000-000000000005');
select is((select count(*) from public.invoices
  where estimate_id = '51000000-0000-4000-8000-000000000004'),
  0::bigint, 'A recurring proposal does not issue a work milestone invoice');
select is((select count(*) from public.invoices
  where estimate_id = '51000000-0000-4000-8000-000000000005'),
  0::bigint, 'A work proposal does not issue an invoice on acceptance');
select is((select count(*) from public.invoice_milestone_drafts
  where estimate_id = '51000000-0000-4000-8000-000000000004'),
  0::bigint, 'A recurring proposal does not prepare a milestone draft');
select is((select count(*) from public.invoice_milestone_drafts
  where estimate_id = '51000000-0000-4000-8000-000000000005'),
  1::bigint, 'A work proposal prepares its first milestone draft');
insert into auth.users (id, email) values
  ('51000000-0000-4000-8000-000000000006', 'editor-destination@example.test'),
  ('51000000-0000-4000-8000-000000000007', 'viewer-destination@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('51000000-0000-4000-8000-000000000001',
   '51000000-0000-4000-8000-000000000006', 'editor'),
  ('51000000-0000-4000-8000-000000000001',
   '51000000-0000-4000-8000-000000000007', 'viewer');

set local role authenticated;
set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000006';
select throws_ok(
  $$select public.convert_accepted_estimate_to_work(
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000004',
    '51000000-0000-4000-8000-000000000008')$$,
  'P0409', 'El destino publicado de este presupuesto es contrato',
  'Contract proposals cannot become work orders');
select set_config('test.destination_contract_id',
  public.convert_accepted_estimate_to_contract(
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000004',
    '51000000-0000-4000-8000-000000000003', null,
    '2027-03-01', null, null,
    '51000000-0000-4000-8000-000000000009')::text, true);
select is((select price_cents from public.service_contracts
  where id = current_setting('test.destination_contract_id')::uuid),
  18000::bigint, 'Contract price is the accepted net price per period');
select is((select billing_frequency from public.service_contracts
  where id = current_setting('test.destination_contract_id')::uuid),
  'quarterly', 'Contract uses the accepted periodicity');
select is((select source_snapshot #>> '{estimate,estimate_lines,0,description}'
  from public.service_contracts
  where id = current_setting('test.destination_contract_id')::uuid),
  'Visitas periódicas', 'Contract keeps the accepted line snapshot');
select is((select destination from public.estimate_conversion_destinations
  where estimate_id = '51000000-0000-4000-8000-000000000004'),
  'contract', 'Contract conversion claims the proposal once');
set local role postgres;
select throws_ok(
  $$insert into public.work_orders
    (tenant_id, client_id, origin_estimate_id, title, source_snapshot, created_by)
    values ('51000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000002',
      '51000000-0000-4000-8000-000000000004', 'Destino indebido',
      '{}'::jsonb, '51000000-0000-4000-8000-000000000006')$$,
  'P0409', 'El destino publicado no coincide con esta conversión',
  'Even a direct insert cannot bypass the published destination');
set local role authenticated;
select is(public.convert_accepted_estimate_to_contract(
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000004',
    '51000000-0000-4000-8000-000000000003', null,
    '2027-03-01', null, null,
    '51000000-0000-4000-8000-000000000009'),
  current_setting('test.destination_contract_id')::uuid,
  'Retrying the same operation returns the same contract');
select is(public.convert_accepted_estimate_to_contract(
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000004',
    '51000000-0000-4000-8000-000000000003', null,
    '2027-03-01', null, null,
    '51000000-0000-4000-8000-000000000010'),
  current_setting('test.destination_contract_id')::uuid,
  'A different operation still finds one contract');
select throws_ok(
  $$select public.convert_accepted_estimate_to_contract(
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000004',
    '51000000-0000-4000-8000-000000000003', null,
    '2027-03-02', null, null,
    '51000000-0000-4000-8000-000000000009')$$,
  '23505', 'La clave de operación ya se utilizó con otros datos',
  'An operation key cannot be reused with changed dates');
select throws_ok(
  $$select public.convert_accepted_estimate_to_contract(
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000005',
    '51000000-0000-4000-8000-000000000003', null,
    '2027-03-01', null, null,
    '51000000-0000-4000-8000-000000000011')$$,
  'P0409', 'El destino publicado de este presupuesto es trabajo',
  'Work proposals cannot become contracts');
select set_config('test.destination_work_id',
  public.convert_accepted_estimate_to_work(
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000005',
    '51000000-0000-4000-8000-000000000012')::text, true);
select is((select destination from public.estimate_conversion_destinations
  where estimate_id = '51000000-0000-4000-8000-000000000005'),
  'work', 'Work conversion also claims its proposal');
select is((select count(*) from public.service_contracts), 1::bigint,
  'Retries leave one contract');
set local request.jwt.claim.sub = '51000000-0000-4000-8000-000000000007';
select throws_ok(
  $$select public.convert_accepted_estimate_to_contract(
    '51000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000004',
    '51000000-0000-4000-8000-000000000003', null,
    '2027-03-01', null, null,
    '51000000-0000-4000-8000-000000000013')$$,
  '42501', 'No tienes permiso para crear contratos',
  'Viewer cannot use the conversion command');
select * from finish();
rollback;
