begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.tenants(id,name,is_complimentary) values
  ('c6130000-0000-4000-8000-000000000001','Signature test',true),
  ('c6130000-0000-4000-8000-000000000002','Other signature tenant',true);
insert into public.clients(id,tenant_id,name) values
  ('c6130000-0000-4000-8000-000000000003','c6130000-0000-4000-8000-000000000001','Signature client');
insert into auth.users(id,email) values
  ('c6130000-0000-4000-8000-000000000004','signature-admin@example.test'),
  ('c6130000-0000-4000-8000-000000000005','signature-user@example.test'),
  ('c6130000-0000-4000-8000-000000000006','signature-other@example.test');
insert into public.memberships(tenant_id,user_id,role) values
  ('c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000004','admin'),
  ('c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000005','user'),
  ('c6130000-0000-4000-8000-000000000002','c6130000-0000-4000-8000-000000000006','admin');
insert into public.service_contracts(id,operation_id,tenant_id,client_id,title,starts_on,price_cents,billing_frequency,timezone,source_snapshot)
  values('c6130000-0000-4000-8000-000000000007','c6130000-0000-4000-8000-000000000008',
    'c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000003','Signature contract','2027-01-01',10000,'monthly','Europe/Madrid','{}');

insert into public.service_contract_visit_rules(id,tenant_id,contract_id,season,months,weekday,frequency,local_start,duration_minutes,title,configured)
  values('c6130000-0000-4000-8000-000000000012','c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000007','high',array[1]::smallint[],1,'once','09:00',60,'Signature job',false);
select set_config('test.sig_assignments','[{"task_key":"job:c6130000-0000-4000-8000-000000000012","job_id":"c6130000-0000-4000-8000-000000000012","assigned_user_ids":["c6130000-0000-4000-8000-000000000005"],"work_team_id":null}]',true);
select ok(not has_function_privilege('anon','public.record_contract_signature(uuid,uuid,timestamptz,uuid,text,text,jsonb)','EXECUTE'), 'Anonymous callers cannot sign');
select ok((select not public and file_size_limit=15728640 and allowed_mime_types=array['application/pdf'] from storage.buckets where id='signed-contracts'), 'Signed contracts bucket is private, PDF-only, and capped at 15 MB');
set local role authenticated;
set local request.jwt.claim.sub='c6130000-0000-4000-8000-000000000004';
select set_config('test.sig_version',(select updated_at::text from public.service_contracts where id='c6130000-0000-4000-8000-000000000007'),true);
select set_config('test.sig_path','c6130000-0000-4000-8000-000000000001/c6130000-0000-4000-8000-000000000007/c6130000-0000-4000-8000-000000000010.pdf',true);

select throws_ok($$select public.record_contract_signature('c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000007','2000-01-01','c6130000-0000-4000-8000-000000000009')$$,
  '40001',null,'Stale versions cannot register a signature');
select lives_ok($$select public.record_contract_signature('c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000007',current_setting('test.sig_version')::timestamptz,'c6130000-0000-4000-8000-000000000009',p_assignments=>current_setting('test.sig_assignments')::jsonb)$$,
  'Administrator can sign without a document');
select ok((select signed_at is not null and signed_by=auth.uid() and signed_document_path is null from public.service_contracts where id='c6130000-0000-4000-8000-000000000007'),'Signature records date and administrator');
select is((select status from public.service_contracts where id='c6130000-0000-4000-8000-000000000007'),'draft','Signing does not activate the contract');
select is((select count(*) from public.service_visits where contract_id='c6130000-0000-4000-8000-000000000007'),0::bigint,'Signing generates no visits');
select lives_ok($$select public.record_contract_signature('c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000007',current_setting('test.sig_version')::timestamptz,'c6130000-0000-4000-8000-000000000009',p_assignments=>current_setting('test.sig_assignments')::jsonb)$$,
  'Successful operation retries ignore the old version');
select is((select count(*) from public.service_contract_events where contract_id='c6130000-0000-4000-8000-000000000007' and kind='signed'),1::bigint,'Retry does not duplicate the audit event');
select set_config('test.sig_version',(select updated_at::text from public.service_contracts where id='c6130000-0000-4000-8000-000000000007'),true);
select throws_ok($$select public.record_contract_signature('c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000007',current_setting('test.sig_version')::timestamptz,'c6130000-0000-4000-8000-000000000009',current_setting('test.sig_path'),'Signed.pdf')$$,
  '22023',null,'An operation cannot be reused with different evidence');
select throws_ok($$select public.record_contract_signature('c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000007',current_setting('test.sig_version')::timestamptz,'c6130000-0000-4000-8000-000000000010',current_setting('test.sig_path'),'Signed.pdf')$$,
  '22023',null,'A document must already exist in storage');

-- Only metadata is inserted; no PDF is uploaded. The entire transaction rolls back.
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) values('signed-contracts',current_setting('test.sig_path'),auth.uid()::text,'{"mimetype":"application/pdf","size":1024}')$$,
  'Administrator can upload evidence for their contract');
select is((select count(*) from storage.objects where bucket_id='signed-contracts' and name=current_setting('test.sig_path')),0::bigint,'Unregistered uploads are not readable');
select throws_ok($$select public.record_contract_signature('c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000007',current_setting('test.sig_version')::timestamptz,'c6130000-0000-4000-8000-000000000011',current_setting('test.sig_path'),'Signed.pdf')$$,
  '22023',null,'Evidence path must belong to the same operation');
select lives_ok($$select public.record_contract_signature('c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000007',current_setting('test.sig_version')::timestamptz,'c6130000-0000-4000-8000-000000000010',current_setting('test.sig_path'),'Signed.pdf')$$,
  'Administrator can attach the PDF after signing');
select is((select signed_document_name from public.service_contracts where id='c6130000-0000-4000-8000-000000000007'),'Signed.pdf','Document name is persisted');
select is((select count(*) from storage.objects where bucket_id='signed-contracts' and name=current_setting('test.sig_path')),1::bigint,'Registered evidence is readable by the administrator');
select is((select count(*) from public.service_contract_events where contract_id='c6130000-0000-4000-8000-000000000007' and kind='signed_document_attached'),1::bigint,'Attachment has its own audit event');
select set_config('test.sig_version',(select updated_at::text from public.service_contracts where id='c6130000-0000-4000-8000-000000000007'),true);
select throws_ok($$select public.record_contract_signature('c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000007',current_setting('test.sig_version')::timestamptz,'c6130000-0000-4000-8000-000000000011',current_setting('test.sig_path'),'Replacement.pdf')$$,
  '22023',null,'Registered evidence cannot be replaced');
select lives_ok($$select public.record_contract_signature('c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000007',current_setting('test.sig_version')::timestamptz,'c6130000-0000-4000-8000-000000000010',current_setting('test.sig_path'),'Signed.pdf')$$,
  'Attachment retry is idempotent');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) values('signed-contracts',current_setting('test.sig_path'),auth.uid()::text,'{"mimetype":"application/pdf","size":1024}')$$,
  '23505',null,'An upload retry reaches the immutable-object conflict rather than failing authorization');
select throws_ok($$insert into storage.objects(bucket_id,name) values('signed-contracts',replace(current_setting('test.sig_path'),'000000000010.pdf','000000000011.pdf'))$$,
  '42501',null,'Additional uploads are rejected once evidence is registered');
select throws_ok($$update public.service_contracts set signed_at=null where id='c6130000-0000-4000-8000-000000000007'$$,
  '42501',null,'Direct signature edits are forbidden');

set local request.jwt.claim.sub='c6130000-0000-4000-8000-000000000005';
select throws_ok($$select public.record_contract_signature('c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000007',current_setting('test.sig_version')::timestamptz,'c6130000-0000-4000-8000-000000000011')$$,
  '42501',null,'Regular users cannot sign');
select is((select count(*) from storage.objects where bucket_id='signed-contracts' and name=current_setting('test.sig_path')),0::bigint,'Regular users cannot read signed PDFs');
select throws_ok($$insert into storage.objects(bucket_id,name) values('signed-contracts',replace(current_setting('test.sig_path'),'000000000010.pdf','000000000011.pdf'))$$,
  '42501',null,'Regular users cannot upload signed PDFs');
set local request.jwt.claim.sub='c6130000-0000-4000-8000-000000000006';
select throws_ok($$select public.record_contract_signature('c6130000-0000-4000-8000-000000000001','c6130000-0000-4000-8000-000000000007',current_setting('test.sig_version')::timestamptz,'c6130000-0000-4000-8000-000000000011')$$,
  '42501',null,'Other-tenant administrators cannot sign');
select is((select count(*) from storage.objects where bucket_id='signed-contracts' and name=current_setting('test.sig_path')),0::bigint,'Other tenants cannot read signed PDFs');
select throws_ok($$insert into storage.objects(bucket_id,name) values('signed-contracts',replace(current_setting('test.sig_path'),'000000000010.pdf','000000000011.pdf'))$$,
  '42501',null,'Other tenants cannot upload signed PDFs');

select * from finish();
rollback;
