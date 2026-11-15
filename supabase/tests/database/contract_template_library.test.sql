begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.tenants(id,name,is_complimentary) values
  ('df000000-0000-4000-8000-000000000001','Library company',true),
  ('df000000-0000-4000-8000-000000000002','Other company',true);
insert into public.clients(id,tenant_id,name) values
  ('df000000-0000-4000-8000-000000000003','df000000-0000-4000-8000-000000000001','Client');
insert into auth.users(id,email) values
  ('df000000-0000-4000-8000-000000000004','library-admin@example.test'),
  ('df000000-0000-4000-8000-000000000005','library-user@example.test'),
  ('df000000-0000-4000-8000-000000000006','library-other@example.test');
insert into public.memberships(tenant_id,user_id,role) values
  ('df000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000004','admin'),
  ('df000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000005','user'),
  ('df000000-0000-4000-8000-000000000002','df000000-0000-4000-8000-000000000006','admin');
insert into public.service_contracts(id,operation_id,tenant_id,client_id,title,starts_on,price_cents,billing_frequency,timezone,source_snapshot)
values ('df000000-0000-4000-8000-000000000007','df000000-0000-4000-8000-000000000008',
  'df000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000003','Contract','2027-01-01',10000,'monthly','Europe/Madrid','{}');

set local role authenticated;
set local request.jwt.claim.sub='df000000-0000-4000-8000-000000000004';
select is(public.save_contract_template_section('df000000-0000-4000-8000-000000000001','section',0,'Title','**Original**',true,'markdown'),1,'Admin saves a section');
select throws_ok($$select public.save_contract_template_section('df000000-0000-4000-8000-000000000001','section',0,'Title','stale',true,'markdown')$$,'40001',null,'Stale section rejected');
select is(public.save_contract_library_template('df000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000009',0,'Template',array['section'],'{}'),1,'Admin saves a template');
select throws_ok($$select public.save_contract_library_template('df000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000010',0,'Duplicate',array['section'],array['section'])$$,'22023',null,'Duplicate sections rejected');
select throws_ok($$select public.save_contract_library_template('df000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000010',0,'Missing',array['missing'],'{}')$$,'22023',null,'Missing sections rejected');
select set_config('test.library_version',(select updated_at::text from public.service_contracts where id='df000000-0000-4000-8000-000000000007'),true);
select throws_ok($$select public.apply_contract_library_template('df000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000007','df000000-0000-4000-8000-000000000009',1,'2000-01-01','df000000-0000-4000-8000-000000000011')$$,'40001',null,'Stale contract rejected');
select lives_ok($$select public.apply_contract_library_template('df000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000007','df000000-0000-4000-8000-000000000009',1,current_setting('test.library_version')::timestamptz,'df000000-0000-4000-8000-000000000011')$$,'Apply to draft');
select lives_ok($$select public.apply_contract_library_template('df000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000007','df000000-0000-4000-8000-000000000009',1,current_setting('test.library_version')::timestamptz,'df000000-0000-4000-8000-000000000011')$$,'Retry is idempotent');
select is((select document_sections->'before'->0->>'format' from public.service_contracts where id='df000000-0000-4000-8000-000000000007'),'markdown','Snapshot retains format');
select is(public.save_contract_template_section('df000000-0000-4000-8000-000000000001','section',1,'Title','Changed',true,'markdown'),2,'Section can change');
select is((select revision from public.contract_template_library where id='df000000-0000-4000-8000-000000000009'),2,'Section changes bump template version');
select is((select document_sections->'before'->0->>'content' from public.service_contracts where id='df000000-0000-4000-8000-000000000007'),'**Original**','Saved contract remains unchanged');
select throws_ok($$select public.apply_contract_library_template('df000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000007','df000000-0000-4000-8000-000000000009',1,(select updated_at from public.service_contracts where id='df000000-0000-4000-8000-000000000007'),'df000000-0000-4000-8000-000000000012')$$,'40001',null,'Stale template rejected');
set local role postgres;
update public.service_contracts set signed_at=now() where id='df000000-0000-4000-8000-000000000007';
set local role authenticated;
select throws_ok($$select public.apply_contract_library_template('df000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000007','df000000-0000-4000-8000-000000000009',2,(select updated_at from public.service_contracts where id='df000000-0000-4000-8000-000000000007'),'df000000-0000-4000-8000-000000000013')$$,'22023',null,'Signed draft cannot change');
set local request.jwt.claim.sub='df000000-0000-4000-8000-000000000005';
select throws_ok($$select public.save_contract_template_section('df000000-0000-4000-8000-000000000001','other',0,'Title','Text',false,'plain')$$,'42501',null,'Ordinary user cannot edit');
set local request.jwt.claim.sub='df000000-0000-4000-8000-000000000006';
select is((select count(*) from public.contract_template_sections where tenant_id='df000000-0000-4000-8000-000000000001'),0::bigint,'Other tenant cannot read');
select throws_ok($$select public.apply_contract_library_template('df000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000007','df000000-0000-4000-8000-000000000009',2,now(),'df000000-0000-4000-8000-000000000014')$$,'42501',null,'Other tenant cannot apply');
select * from finish();
rollback;