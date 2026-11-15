begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.tenants(id,name,is_complimentary) values
  ('de000000-0000-4000-8000-000000000001','Template company',true),
  ('de000000-0000-4000-8000-000000000002','Other company',true);
insert into public.clients(id,tenant_id,name) values
  ('de000000-0000-4000-8000-000000000003','de000000-0000-4000-8000-000000000001','Client');
insert into auth.users(id,email) values
  ('de000000-0000-4000-8000-000000000004','template-admin@example.test'),
  ('de000000-0000-4000-8000-000000000005','template-user@example.test'),
  ('de000000-0000-4000-8000-000000000006','template-other@example.test');
insert into public.memberships(tenant_id,user_id,role) values
  ('de000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000004','admin'),
  ('de000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000005','user'),
  ('de000000-0000-4000-8000-000000000002','de000000-0000-4000-8000-000000000006','admin');

set local role authenticated;
set local request.jwt.claim.sub='de000000-0000-4000-8000-000000000004';
select is(public.save_contract_document_template('de000000-0000-4000-8000-000000000001',0,
  '{"before":[{"id":"one","title":"First","content":"Original","pageBreakBefore":true}],"after":[]}'::jsonb),1,'Admin saves a template');
select throws_ok($$select public.save_contract_document_template('de000000-0000-4000-8000-000000000001',0,'{"before":[],"after":[]}')$$,
  '40001',null,'Stale template revisions are rejected');
select throws_ok($$select public.save_contract_document_template('de000000-0000-4000-8000-000000000001',1,'{"before":[{"id":"a","title":"","content":"","pageBreakBefore":true}],"after":[{"id":"a","title":"","content":"","pageBreakBefore":false}]}')$$,
  '22023',null,'Duplicate section ids are rejected');
set local role postgres;
insert into public.service_contracts(id,operation_id,tenant_id,client_id,title,starts_on,price_cents,billing_frequency,timezone,source_snapshot)
  values('de000000-0000-4000-8000-000000000007','de000000-0000-4000-8000-000000000008',
    'de000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000003','Contract','2027-01-01',10000,'monthly','Europe/Madrid','{}');
select is((select document_sections->'before'->0->>'content' from public.service_contracts where id='de000000-0000-4000-8000-000000000007'), 'Original', 'New contracts snapshot the template');
set local role authenticated;
select is(public.save_contract_document_template('de000000-0000-4000-8000-000000000001',1,
  '{"before":[],"after":[{"id":"two","title":"Last","content":"Updated","pageBreakBefore":false}]}'::jsonb),2,'Template can be updated');
select is((select document_sections->'before'->0->>'content' from public.service_contracts where id='de000000-0000-4000-8000-000000000007'), 'Original', 'Existing snapshots do not change');
select throws_ok($$select public.apply_contract_document_template('de000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000007','2000-01-01','de000000-0000-4000-8000-000000000009')$$,
  '40001',null,'Stale contracts cannot apply the template');
select set_config('test.template_version',(select updated_at::text from public.service_contracts where id='de000000-0000-4000-8000-000000000007'),true);
select lives_ok($$select public.apply_contract_document_template('de000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000007',current_setting('test.template_version')::timestamptz,'de000000-0000-4000-8000-000000000009')$$,'Unsigned drafts can apply the template');
select lives_ok($$select public.apply_contract_document_template('de000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000007',current_setting('test.template_version')::timestamptz,'de000000-0000-4000-8000-000000000009')$$,'Applying is idempotent');
select is((select document_sections->'after'->0->>'content' from public.service_contracts where id='de000000-0000-4000-8000-000000000007'),'Updated','Draft receives the latest snapshot');
set local role postgres;
update public.service_contracts set signed_at=now() where id='de000000-0000-4000-8000-000000000007';
set local role authenticated;
select throws_ok($$select public.apply_contract_document_template('de000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000007',(select updated_at from public.service_contracts where id='de000000-0000-4000-8000-000000000007'),'de000000-0000-4000-8000-000000000010')$$,
  '22023',null,'Signed drafts cannot change the template');
set local request.jwt.claim.sub='de000000-0000-4000-8000-000000000005';
select throws_ok($$select public.save_contract_document_template('de000000-0000-4000-8000-000000000001',2,'{"before":[],"after":[]}')$$,
  '42501',null,'Ordinary users cannot edit the template');
set local request.jwt.claim.sub='de000000-0000-4000-8000-000000000006';
select is((select count(*) from public.contract_document_templates where tenant_id='de000000-0000-4000-8000-000000000001'),0::bigint,'Another company cannot read the template');
select throws_ok($$select public.apply_contract_document_template('de000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000007',now(),'de000000-0000-4000-8000-000000000011')$$,
  '42501',null,'Another company cannot apply the template');
select * from finish();
rollback;