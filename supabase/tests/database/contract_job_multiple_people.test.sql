-- Self-contained integration assertions; all test data is rolled back.
begin;
set local plpgsql.check_asserts = on;
insert into public.tenants(id,name,is_complimentary) values
  ('c6150000-0000-4000-8000-000000000001','Multiple job people test',true),
  ('c6150000-0000-4000-8000-000000000002','Other job people tenant',true);
insert into public.clients(id,tenant_id,name) values
  ('c6150000-0000-4000-8000-000000000003','c6150000-0000-4000-8000-000000000001','Client');
insert into public.service_locations(id,tenant_id,client_id,name,address) values
  ('c6150000-0000-4000-8000-000000000004','c6150000-0000-4000-8000-000000000001','c6150000-0000-4000-8000-000000000003','Centre','Test address');
insert into auth.users(id,email) values
  ('c6150000-0000-4000-8000-000000000005','job-people-admin@example.test'),
  ('c6150000-0000-4000-8000-000000000006','job-people-one@example.test'),
  ('c6150000-0000-4000-8000-000000000007','job-people-two@example.test'),
  ('c6150000-0000-4000-8000-000000000008','job-people-other@example.test'),
  ('c6150000-0000-4000-8000-000000000009','job-people-viewer@example.test');
insert into public.memberships(tenant_id,user_id,role) values
  ('c6150000-0000-4000-8000-000000000001','c6150000-0000-4000-8000-000000000005','admin'),
  ('c6150000-0000-4000-8000-000000000001','c6150000-0000-4000-8000-000000000006','user'),
  ('c6150000-0000-4000-8000-000000000001','c6150000-0000-4000-8000-000000000007','technician'),
  ('c6150000-0000-4000-8000-000000000002','c6150000-0000-4000-8000-000000000008','user'),
  ('c6150000-0000-4000-8000-000000000001','c6150000-0000-4000-8000-000000000009','viewer');
insert into public.service_contracts(id,operation_id,tenant_id,client_id,title,starts_on,ends_on,price_cents,billing_frequency,timezone,source_snapshot)
  values('c6150000-0000-4000-8000-000000000010','c6150000-0000-4000-8000-000000000011',
    'c6150000-0000-4000-8000-000000000001','c6150000-0000-4000-8000-000000000003','Contract',
    '2027-01-01','2027-12-31',10000,'monthly','Europe/Madrid','{}');
set local role authenticated;
set local request.jwt.claim.sub='c6150000-0000-4000-8000-000000000005';
do $$
declare
  tenant constant uuid:='c6150000-0000-4000-8000-000000000001';
  contract constant uuid:='c6150000-0000-4000-8000-000000000010';
  op constant uuid:='c6150000-0000-4000-8000-000000000012';
  first_person constant uuid:='c6150000-0000-4000-8000-000000000006';
  second_person constant uuid:='c6150000-0000-4000-8000-000000000007';
  outsiders constant uuid:='c6150000-0000-4000-8000-000000000008';
  payload jsonb; invalid jsonb; changed jsonb; version timestamptz; job uuid; setup jsonb; assignments jsonb;
begin
  payload:=jsonb_build_object('title','Windows','tasks','Clean','location_id','c6150000-0000-4000-8000-000000000004',
    'modality','mobile','service_type','ordinary','frequency','monthly','anchor_on','2027-01-01',
    'duration_minutes',60,'local_start','09:00','weekdays','[]'::jsonb,'weekly_slots','[]'::jsonb,
    'assigned_user_id',first_person,'assigned_user_ids',jsonb_build_array(first_person,second_person),'work_team_id',null);
  select updated_at into version from public.service_contracts where id=contract;
  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_set(payload,'{assigned_user_ids}',jsonb_build_array(first_person,outsiders)),
    jsonb_set(payload,'{work_team_id}',to_jsonb('c6150000-0000-4000-8000-000000000099'::text)),
    jsonb_set(payload,'{assigned_user_id}',to_jsonb(second_person)),
    jsonb_set(payload,'{assigned_user_ids}','null'::jsonb)
  )) loop
    begin
      perform public.save_contract_job(tenant,contract,null,version,invalid,op);
      raise exception 'Invalid assignment accepted';
    exception when sqlstate '22023' then null; end;
    assert not exists(select 1 from public.service_contract_visit_rules where contract_id=contract), 'Invalid save rolled back';
  end loop;
  job:=public.save_contract_job(tenant,contract,null,version,payload,op);
  assert (select assigned_user_ids=array[first_person,second_person] and assigned_user_id=first_person
    from public.service_contract_visit_rules where id=job), 'All job people persisted with compatible visit assignee';
  setup:=public.load_contract_assignment_setup(tenant,contract);
  assert setup #> '{jobs,0,assigned_user_ids}'=jsonb_build_array(first_person,second_person), 'Signature setup restores all job people';
  changed:=jsonb_set(jsonb_set(payload,'{assigned_user_ids}',jsonb_build_array(second_person)),'{assigned_user_id}',to_jsonb(second_person));
  perform public.save_contract_job(tenant,contract,job,(select updated_at from public.service_contracts where id=contract),changed,'c6150000-0000-4000-8000-000000000013');
  perform public.save_contract_job(tenant,contract,null,version,payload,op);
  assert (select assigned_user_ids=array[second_person] from public.service_contract_visit_rules where id=job), 'Old retry cannot overwrite later people';
  perform public.save_contract_job(tenant,contract,job,(select updated_at from public.service_contracts where id=contract),payload,'c6150000-0000-4000-8000-000000000014');
  assignments:=jsonb_build_array(jsonb_build_object('task_key','job:'||job::text,'job_id',job,
    'assigned_user_ids',jsonb_build_array(first_person,second_person),'work_team_id',null));
  perform public.record_contract_signature(tenant,contract,(select updated_at from public.service_contracts where id=contract),
    'c6150000-0000-4000-8000-000000000015',p_assignments=>assignments);
  assert (select assigned_user_ids=array[first_person,second_person] from public.contract_task_assignments where job_id=job), 'Signature retains all people';
  assert (select assigned_user_ids=array[first_person,second_person] from public.service_contract_visit_rules where id=job), 'Signature retains job people';
  assert not exists(select 1 from public.service_visits where contract_id=contract), 'Signing does not generate visits';
end; $$;
set local request.jwt.claim.sub='c6150000-0000-4000-8000-000000000009';
do $$ begin
  begin
    perform public.save_contract_job('c6150000-0000-4000-8000-000000000001','c6150000-0000-4000-8000-000000000010',null,now(),'{}',gen_random_uuid());
    raise exception 'Viewer was allowed to save';
  exception when insufficient_privilege then null; end;
end; $$;
select '1..1' as result union all select 'ok 1 - Multiple job assignments passed; fixtures rolled back';
rollback;