begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.tenants (id, name) values
  ('30000000-0000-4000-8000-000000000001', 'Empresa original'),
  ('30000000-0000-4000-8000-000000000002', 'Empresa ajena');
insert into public.clients (id, tenant_id, name) values
  ('30000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001', 'Cliente original');
insert into public.estimates (id, tenant_id, client_id, title, valid_until) values
  ('30000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003', 'Piscina nueva', current_date + 30);
insert into public.estimate_lines (
  id, tenant_id, estimate_id, position, description, kind, quantity, unit_price_cents
) values (
  '30000000-0000-4000-8000-000000000005',
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000004', 1, 'Instalación', 'labor', 1, 10000
);
insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000006', 'publisher@example.test');
insert into public.memberships (tenant_id, user_id, role) values
  ('30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000006', 'editor');

set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-4000-8000-000000000006';
select lives_ok(
  $$update public.estimates set status = 'sent'
    where id = '30000000-0000-4000-8000-000000000004'$$,
  'Publishing creates a snapshot in the same transaction');
select is((select count(*) from public.estimate_publications), 1::bigint,
  'The publication is visible in its company');
select is((select source from public.estimate_publications), 'publication',
  'A new publication is distinguishable from a migrated reconstruction');
select is((select snapshot #>> '{estimate,estimate_lines,0,description}'
  from public.estimate_publications), 'Instalación',
  'The exact line description is captured');

update public.clients set name = 'Cliente cambiado'
where id = '30000000-0000-4000-8000-000000000003';
update public.tenants set name = 'Empresa cambiada'
where id = '30000000-0000-4000-8000-000000000001';
select is((select snapshot #>> '{client,name}' from public.estimate_publications),
  'Cliente original', 'Changing the client does not rewrite a published version');
select is((select snapshot #>> '{tenant,name}' from public.estimate_publications),
  'Empresa original', 'Changing the company does not rewrite a published version');
select throws_ok(
  $$update public.estimates set email_sent_at = now()
    where id = '30000000-0000-4000-8000-000000000004'$$,
  'P0001', 'La confirmación de envío de correo pertenece al servidor',
  'A browser role cannot claim an email was delivered');

set local role postgres;
select lives_ok(
  $$update public.estimates set email_sent_at = now()
    where id = '30000000-0000-4000-8000-000000000004'$$,
  'The delivery marker can be recorded after an external send succeeds');
select throws_ok(
  $$delete from public.estimate_publications$$,
  'P0001', 'La versión publicada de un presupuesto es inmutable',
  'Even a privileged table role cannot delete a publication');

select * from finish();
rollback;
