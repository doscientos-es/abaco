begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.tenants(id,name) values('75000000-0000-4000-8000-000000000001','Contract jobs TEST');
insert into public.clients(id,tenant_id,name) values('75000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000001','Client TEST');
insert into public.service_locations(id,tenant_id,client_id,name,address) values('75000000-0000-4000-8000-000000000005','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000002','Office TEST','Fictional address');
insert into auth.users(id,email) values('75000000-0000-4000-8000-000000000003','jobs-admin@example.test'),('75000000-0000-4000-8000-000000000004','jobs-viewer@example.test');
insert into public.memberships(tenant_id,user_id,role) values('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000003','admin'),('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000004','viewer');
insert into public.work_teams(id,tenant_id,name) values('75000000-0000-4000-8000-000000000040','75000000-0000-4000-8000-000000000001','Mobile team TEST');
insert into public.estimates(id,tenant_id,client_id,title,valid_until,contract_billing_frequency,discount_type,discount_value) values
  ('75000000-0000-4000-8000-000000000010','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000002','Office cleaning',current_date+30,'once','percent',10),
  ('75000000-0000-4000-8000-000000000020','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000002','Public proposal',current_date+30,'monthly','none',0);
insert into public.estimate_lines(id,tenant_id,estimate_id,description,kind,quantity,unit_price_cents) values
  ('75000000-0000-4000-8000-000000000011','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000010','One-off cleaning','labor',1,10000),
  ('75000000-0000-4000-8000-000000000012','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000010','Permanent sheet','labor',1,5000),
  ('75000000-0000-4000-8000-000000000013','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000010','Monthly windows','labor',1,2000),
  ('75000000-0000-4000-8000-000000000021','75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000020','Public service','labor',1,1000);
select ok((select automatic_contract and conversion_destination='contract' from public.estimates where id='75000000-0000-4000-8000-000000000010'),'New proposals default to automatic contracts');
update public.estimates set status='sent' where tenant_id='75000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claim.sub='75000000-0000-4000-8000-000000000003';
select public.accept_estimate_manually('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000010','75000000-0000-4000-8000-000000000030','Client TEST','Written acceptance in the test file');
select is((select count(*) from public.service_contracts where origin_estimate_id='75000000-0000-4000-8000-000000000010'),0::bigint,'Conversion waits for acceptance evidence');
set constraints public.estimates_create_contract immediate;
set constraints public.estimates_create_contract deferred;
select set_config('test.jobs_contract',(select id::text from public.service_contracts where origin_estimate_id='75000000-0000-4000-8000-000000000010'),true);
select is((select status from public.service_contracts where id=current_setting('test.jobs_contract')::uuid),'draft','Acceptance creates a draft, not active visits');
select is((select price_cents from public.service_contracts where id=current_setting('test.jobs_contract')::uuid),15300::bigint,'Agreed net price preserves global discounts');
select is((select source_snapshot #>> '{acceptance,mode}' from public.service_contracts where id=current_setting('test.jobs_contract')::uuid),'office_manual','Deferred conversion preserves manual provenance');
select is((select source_snapshot #>> '{acceptance,evidence_description}' from public.service_contracts where id=current_setting('test.jobs_contract')::uuid),'Written acceptance in the test file','Evidence is copied after it is recorded');
select ok((select location_id is null and renewal_mode='pending' from public.service_contracts where id=current_setting('test.jobs_contract')::uuid),'No invented centre or renewal agreement');
select is((select count(*) from public.service_contract_visit_rules where contract_id=current_setting('test.jobs_contract')::uuid and not configured),3::bigint,'Every quoted item becomes a distinct unconfigured job');
select is((select count(distinct source_line_id) from public.service_contract_visit_rules where contract_id=current_setting('test.jobs_contract')::uuid),3::bigint,'Source items are retained independently');
select is((select count(*) from public.invoice_milestone_drafts where estimate_id='75000000-0000-4000-8000-000000000010'),0::bigint,'Automatic contracts do not create milestone invoices');
select public.accept_estimate_manually('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000010','75000000-0000-4000-8000-000000000030','Client TEST','Written acceptance in the test file');
set constraints public.estimates_create_contract immediate;
select is((select count(*) from public.service_contracts where origin_estimate_id='75000000-0000-4000-8000-000000000010'),1::bigint,'Acceptance retry never duplicates the contract');

create function pg_temp.activate_jobs() returns text language sql as $$
  select public.transition_service_contract('75000000-0000-4000-8000-000000000001',current_setting('test.jobs_contract')::uuid,
    (select updated_at from public.service_contracts where id=current_setting('test.jobs_contract')::uuid),'active','',gen_random_uuid());
$$;
select throws_ok('select pg_temp.activate_jobs()','P0409','Configura todos los trabajos antes de activar el contrato','Unconfigured quoted items cannot be activated');
select public.update_draft_contract_details('75000000-0000-4000-8000-000000000001',current_setting('test.jobs_contract')::uuid,
  (select updated_at from public.service_contracts where id=current_setting('test.jobs_contract')::uuid),current_date,current_date+10,'manual','Reception access','75000000-0000-4000-8000-000000000031');
create function pg_temp.save_job(p_source uuid,p_data jsonb,p_operation uuid) returns uuid language sql as $$
  select public.save_contract_job('75000000-0000-4000-8000-000000000001',current_setting('test.jobs_contract')::uuid,
    (select id from public.service_contract_visit_rules where source_line_id=p_source and contract_id=current_setting('test.jobs_contract')::uuid),
    (select updated_at from public.service_contracts where id=current_setting('test.jobs_contract')::uuid),p_data,p_operation);
$$;
select set_config('test.job_payload',jsonb_build_object('title','One-off cleaning','tasks','Clean windows','location_id','75000000-0000-4000-8000-000000000005',
  'modality','mobile','service_type','ordinary','frequency','once','anchor_on',current_date,'duration_minutes',60,'weekdays','[]'::jsonb,'materials','Client supplies products')::text,true);
select set_config('test.job_version',(select updated_at::text from public.service_contracts where id=current_setting('test.jobs_contract')::uuid),true);
select lives_ok($$select pg_temp.save_job('75000000-0000-4000-8000-000000000011',current_setting('test.job_payload')::jsonb,'75000000-0000-4000-8000-000000000032')$$,'A quoted job can be configured as a single order');
select lives_ok($$select pg_temp.save_job('75000000-0000-4000-8000-000000000011',current_setting('test.job_payload')::jsonb,'75000000-0000-4000-8000-000000000032')$$,'Configuration retry is idempotent');
select throws_ok($$select pg_temp.save_job('75000000-0000-4000-8000-000000000011',current_setting('test.job_payload')::jsonb || '{"title":"Different scope"}','75000000-0000-4000-8000-000000000032')$$,'23505','Operación utilizada','An operation cannot be reused with changed data');
select throws_ok($$select pg_temp.save_job('75000000-0000-4000-8000-000000000012',current_setting('test.job_payload')::jsonb || '{"modality":"fixed"}','75000000-0000-4000-8000-000000000033')$$,'22023','Completa el trabajo, su duración y modalidad','One-off jobs cannot produce permanent sheets');
select throws_ok($$select pg_temp.save_job('75000000-0000-4000-8000-000000000012',current_setting('test.job_payload')::jsonb || '{"location_id":null}','75000000-0000-4000-8000-000000000033')$$,'22023','Centro no disponible','Server requires a valid centre');
select lives_ok($$select pg_temp.save_job('75000000-0000-4000-8000-000000000012',current_setting('test.job_payload')::jsonb || '{"title":"Permanent sheet","modality":"fixed","frequency":"weekly","weekdays":[1,3,5],"weekly_slots":[{"id":"mon","weekday":1,"start_minute":540,"duration_minutes":60},{"id":"wed","weekday":3,"start_minute":540,"duration_minutes":60},{"id":"fri","weekday":5,"start_minute":540,"duration_minutes":60}]}','75000000-0000-4000-8000-000000000034')$$,'Weekly permanent sheets belong to the same contract');
select lives_ok($$select pg_temp.save_job('75000000-0000-4000-8000-000000000013',current_setting('test.job_payload')::jsonb || '{"title":"Monthly windows","frequency":"monthly","local_start":"09:00","work_team_id":"75000000-0000-4000-8000-000000000040"}','75000000-0000-4000-8000-000000000035')$$,'Monthly jobs have an independent execution frequency');
select throws_ok($$select public.update_draft_contract_details('75000000-0000-4000-8000-000000000001',current_setting('test.jobs_contract')::uuid,current_setting('test.job_version')::timestamptz,current_date,current_date+10,'manual','','75000000-0000-4000-8000-000000000036')$$,'P0409','Recarga el contrato; no es editable','Stale agreement changes cannot overwrite job configuration');
select is(pg_temp.activate_jobs(),'active','A fully configured agreement can be activated');
select is((select count(*) from public.service_visits where contract_id=current_setting('test.jobs_contract')::uuid),2::bigint,'Activation generates the one-off and mobile monthly jobs');
select is(public.generate_contract_visits('75000000-0000-4000-8000-000000000001',current_date,current_date+10),0,'Repeated preparation never duplicates orders');
select ok((select bool_and(paper_snapshot->>'instructions' like '%Client supplies products%') from public.service_visits where contract_id=current_setting('test.jobs_contract')::uuid),'Materials are captured in immutable paper instructions');
select is(public.generate_contract_billing_periods('75000000-0000-4000-8000-000000000001',current_setting('test.jobs_contract')::uuid,current_date+10),1,'Single-fee agreement creates one billing obligation');
select is(public.generate_contract_billing_periods('75000000-0000-4000-8000-000000000001',current_setting('test.jobs_contract')::uuid,current_date+20),0,'Single-fee billing never falls back to recurring years');

set local role postgres;
set constraints public.estimates_create_contract deferred;
-- This is the exact status update performed by the existing public-estimate endpoint.
set local role service_role;
set local request.jwt.claim.sub='';
update public.estimates set status='accepted',responded_at=now(),responded_by='Public client TEST' where id='75000000-0000-4000-8000-000000000020' and status='sent';
set constraints public.estimates_create_contract immediate;
set local role postgres;
select is((select count(*) from public.service_contracts where origin_estimate_id='75000000-0000-4000-8000-000000000020'),1::bigint,'Public-link status update creates a contract without an authenticated user');
select is((select source_snapshot #>> '{acceptance,mode}' from public.service_contracts where origin_estimate_id='75000000-0000-4000-8000-000000000020'),'public_link','Public acceptance is not attributed to an office user');

set local role authenticated;
set local request.jwt.claim.sub='75000000-0000-4000-8000-000000000004';
select throws_ok($$select pg_temp.save_job(null,current_setting('test.job_payload')::jsonb,'75000000-0000-4000-8000-000000000037')$$,'42501','No tienes permiso','Read-only staff cannot configure jobs');
set local role postgres;
select ok(not has_function_privilege('anon','public.save_contract_job(uuid,uuid,uuid,timestamptz,jsonb,uuid)','execute'),'Anonymous clients cannot configure jobs');
select ok(not has_function_privilege('authenticated','app_private.create_contract_after_acceptance()','execute'),'Acceptance trigger cannot be called as a privileged RPC');
select ok(app_private.cleaning_service_due(current_date,current_date,'once','{}'),'Single orders are due on their anchor');
select ok(not app_private.cleaning_service_due(current_date+1,current_date,'once','{}'),'Single orders never repeat');
select * from finish();
rollback;