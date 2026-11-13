-- Self-contained assertions, also runnable remotely without installing pgTAP.
begin;
insert into public.tenants(id,name,is_complimentary) values
  ('c6140000-0000-4000-8000-000000000001','Assignment test',true),
  ('c6140000-0000-4000-8000-000000000002','Other assignment tenant',true);
insert into public.clients(id,tenant_id,name) values
  ('c6140000-0000-4000-8000-000000000003','c6140000-0000-4000-8000-000000000001','Assignment client');
insert into auth.users(id,email) values
  ('c6140000-0000-4000-8000-000000000004','assignment-admin@example.test'),
  ('c6140000-0000-4000-8000-000000000005','assignment-person@example.test'),
  ('c6140000-0000-4000-8000-000000000006','assignment-other@example.test'),
  ('c6140000-0000-4000-8000-000000000013','assignment-second@example.test');
insert into public.memberships(tenant_id,user_id,role) values
  ('c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000004','admin'),
  ('c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000005','user'),
  ('c6140000-0000-4000-8000-000000000002','c6140000-0000-4000-8000-000000000006','admin'),
  ('c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000013','user');
insert into public.work_teams(id,tenant_id,name,archived_at) values
  ('c6140000-0000-4000-8000-000000000014','c6140000-0000-4000-8000-000000000001','Brigade',null),
  ('c6140000-0000-4000-8000-000000000015','c6140000-0000-4000-8000-000000000001','Archived',now()),
  ('c6140000-0000-4000-8000-000000000016','c6140000-0000-4000-8000-000000000002','Other brigade',null);
insert into public.service_contracts(id,operation_id,tenant_id,client_id,title,starts_on,price_cents,billing_frequency,timezone,source_snapshot)
  values('c6140000-0000-4000-8000-000000000007','c6140000-0000-4000-8000-000000000008',
    'c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000003','Assignment contract','2027-01-01',10000,'monthly','Europe/Madrid',
    '{"estimate":{"document_sections":[{"type":"work_table","id":"s1","title":"Servicios","rows":[{"id":"r1","task":"Accepted windows","frequency":"Semanal","notes":"Agreed scope","periodicities":["weekly"]},{"id":"empty","task":" "}]}]}}');
insert into public.service_contract_visit_rules(id,tenant_id,contract_id,season,months,weekday,frequency,local_start,duration_minutes,title,configured)
  values('c6140000-0000-4000-8000-000000000012','c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000007','high',array[1]::smallint[],1,'once','09:00',60,'Assignment job',false);
select set_config('test.assignments','[{"task_key":"job:c6140000-0000-4000-8000-000000000012","job_id":"c6140000-0000-4000-8000-000000000012","assigned_user_ids":[],"work_team_id":"c6140000-0000-4000-8000-000000000014"},{"task_key":"service:s1:r1","job_id":"c6140000-0000-4000-8000-000000000012","assigned_user_ids":["c6140000-0000-4000-8000-000000000005","c6140000-0000-4000-8000-000000000013"],"work_team_id":null}]',true);
set local role authenticated;
set local request.jwt.claim.sub='c6140000-0000-4000-8000-000000000004';
select set_config('test.assignment_version',(select updated_at::text from public.service_contracts where id='c6140000-0000-4000-8000-000000000007'),true);
do $$
declare
  payload jsonb := current_setting('test.assignments')::jsonb;
  invalid jsonb; setup jsonb;
begin
  setup := public.load_contract_assignment_setup('c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000007');
  assert jsonb_array_length(setup->'tasks')=1 and setup #>> '{tasks,0,title}'='Accepted windows', 'Accepted snapshot tasks only';
  assert setup #> '{tasks,0,periodicities}'='["weekly"]'::jsonb, 'Agreed periodicities retained';
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    null,'[]'::jsonb,payload || jsonb_build_array(payload->0),
    jsonb_set(payload,'{1,task_key}','"unknown"'),
    jsonb_set(payload,'{1,job_id}','"c6140000-0000-4000-8000-000000000099"'),
    jsonb_set(payload,'{1,assigned_user_ids}','["c6140000-0000-4000-8000-000000000006"]'),
    jsonb_set(payload,'{0,work_team_id}','"c6140000-0000-4000-8000-000000000015"'),
    jsonb_set(payload,'{0,work_team_id}','"c6140000-0000-4000-8000-000000000016"'),
    jsonb_set(payload,'{1,work_team_id}','"c6140000-0000-4000-8000-000000000014"')
  )) loop
    begin
      perform public.record_contract_signature('c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000007',current_setting('test.assignment_version')::timestamptz,'c6140000-0000-4000-8000-000000000009',p_assignments=>nullif(invalid,'null'::jsonb));
      raise exception 'Invalid assignment unexpectedly accepted';
    exception when sqlstate '22023' then null;
    end;
    assert (select count(*)=0 from public.contract_task_assignments where contract_id='c6140000-0000-4000-8000-000000000007'), 'Partial assignments rolled back';
    assert (select signed_at is null from public.service_contracts where id='c6140000-0000-4000-8000-000000000007'), 'Invalid setup cannot sign';
    assert (select work_team_id is null from public.service_contract_visit_rules where id='c6140000-0000-4000-8000-000000000012'), 'Job changes rolled back';
  end loop;
  perform public.record_contract_signature('c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000007',current_setting('test.assignment_version')::timestamptz,'c6140000-0000-4000-8000-000000000009',p_assignments=>payload);
  assert (select count(*)=2 from public.contract_task_assignments where contract_id='c6140000-0000-4000-8000-000000000007'), 'Job and task persisted';
  assert (select cardinality(assigned_user_ids)=2 from public.contract_task_assignments where contract_id='c6140000-0000-4000-8000-000000000007' and task_key='service:s1:r1'), 'Multiple task people retained';
  assert (select work_team_id='c6140000-0000-4000-8000-000000000014' from public.service_contract_visit_rules where id='c6140000-0000-4000-8000-000000000012'), 'Job owner reused operationally';
  assert (select signed_at is not null and status='draft' from public.service_contracts where id='c6140000-0000-4000-8000-000000000007'), 'Signature does not activate';
  assert not exists(select 1 from public.service_visits where contract_id='c6140000-0000-4000-8000-000000000007'), 'No visits generated';
  perform public.record_contract_signature('c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000007',current_setting('test.assignment_version')::timestamptz,'c6140000-0000-4000-8000-000000000009',p_assignments=>payload);
  assert (select count(*)=1 from public.service_contract_events where contract_id='c6140000-0000-4000-8000-000000000007' and kind='signed'), 'Retry is idempotent';
  assert (select e.payload->'assignments'=current_setting('test.assignments')::jsonb from public.service_contract_events e where operation_id='c6140000-0000-4000-8000-000000000009'), 'Immutable audit includes assignments';
  begin
    perform public.record_contract_signature('c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000007',current_setting('test.assignment_version')::timestamptz,'c6140000-0000-4000-8000-000000000009',p_assignments=>'[]');
    raise exception 'Changed retry accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    update public.contract_task_assignments set assigned_user_ids='{}' where contract_id='c6140000-0000-4000-8000-000000000007';
    raise exception 'Direct assignment writes accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
do $$
declare version timestamptz; path text := 'c6140000-0000-4000-8000-000000000001/c6140000-0000-4000-8000-000000000007/c6140000-0000-4000-8000-000000000010.pdf';
begin
  begin
    perform public.record_contract_signature('c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000007',current_setting('test.assignment_version')::timestamptz,'c6140000-0000-4000-8000-000000000010',path,'Signed.pdf');
    raise exception 'Stale version accepted';
  exception when serialization_failure then null; end;
  select updated_at into version from public.service_contracts where id='c6140000-0000-4000-8000-000000000007';
  insert into storage.objects(bucket_id,name,owner_id,metadata) values('signed-contracts',path,auth.uid()::text,'{"mimetype":"application/pdf","size":1024}');
  perform public.record_contract_signature('c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000007',version,'c6140000-0000-4000-8000-000000000010',path,'Signed.pdf');
  assert (select signed_document_name='Signed.pdf' from public.service_contracts where id='c6140000-0000-4000-8000-000000000007'), 'PDF attached after assigning';
  assert (select count(*)=2 from public.contract_task_assignments where contract_id='c6140000-0000-4000-8000-000000000007'), 'PDF attachment preserves assignments';
  perform public.record_contract_signature('c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000007',version,'c6140000-0000-4000-8000-000000000010',path,'Signed.pdf');
end; $$;
set local request.jwt.claim.sub='c6140000-0000-4000-8000-000000000005';
do $$ begin
  assert (select count(*)=0 from public.contract_task_assignments), 'User assignment RLS';
  begin
    perform public.load_contract_assignment_setup('c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000007');
    raise exception 'User loaded private setup';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_contract_signature('c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000007',now(),gen_random_uuid());
    raise exception 'User signed contract';
  exception when insufficient_privilege then null; end;
end; $$;
set local request.jwt.claim.sub='c6140000-0000-4000-8000-000000000006';
do $$ begin
  assert (select count(*)=0 from public.contract_task_assignments), 'Cross-tenant assignment RLS';
  begin
    perform public.load_contract_assignment_setup('c6140000-0000-4000-8000-000000000001','c6140000-0000-4000-8000-000000000007');
    raise exception 'Other tenant loaded setup';
  exception when insufficient_privilege then null; end;
end; $$;
select '1..1' as result union all select 'ok 1 - Contract assignment assertions passed; fixtures rolled back';
rollback;
