-- These fixtures and all writes are rolled back.
begin;
set local plpgsql.check_asserts = on;
insert into public.tenants(id,name,is_complimentary) values
  ('a7190000-0000-4000-8000-000000000001','Admin personal test',true),
  ('a7190000-0000-4000-8000-000000000002','Other company',true);
insert into public.clients(id,tenant_id,name) values
  ('a7190000-0000-4000-8000-000000000003','a7190000-0000-4000-8000-000000000001','Client');
insert into public.service_locations(id,tenant_id,client_id,name,address) values
  ('a7190000-0000-4000-8000-000000000007','a7190000-0000-4000-8000-000000000001','a7190000-0000-4000-8000-000000000003','Centre','Test');
insert into auth.users(id,email) values
  ('a7190000-0000-4000-8000-000000000004','admin-personal-test@example.test'),
  ('a7190000-0000-4000-8000-000000000005','worker-personal-test@example.test'),
  ('a7190000-0000-4000-8000-000000000006','other-personal-test@example.test');
insert into public.memberships(tenant_id,user_id,role) values
  ('a7190000-0000-4000-8000-000000000001','a7190000-0000-4000-8000-000000000004','admin'),
  ('a7190000-0000-4000-8000-000000000001','a7190000-0000-4000-8000-000000000005','user'),
  ('a7190000-0000-4000-8000-000000000002','a7190000-0000-4000-8000-000000000006','admin');
insert into public.service_contracts(id,operation_id,tenant_id,client_id,title,starts_on,ends_on,price_cents,billing_frequency,timezone,source_snapshot)
values('a7190000-0000-4000-8000-000000000008','a7190000-0000-4000-8000-000000000009',
  'a7190000-0000-4000-8000-000000000001','a7190000-0000-4000-8000-000000000003','Contract',
  '2091-01-01','2091-12-31',10000,'monthly','Europe/Madrid','{}');
set local role authenticated;
set local request.jwt.claim.sub = 'a7190000-0000-4000-8000-000000000004';
do $$
declare
  tenant constant uuid := 'a7190000-0000-4000-8000-000000000001';
  admin_id constant uuid := 'a7190000-0000-4000-8000-000000000004';
  worker_id constant uuid := 'a7190000-0000-4000-8000-000000000005';
  outsider constant uuid := 'a7190000-0000-4000-8000-000000000006';
  client_id constant uuid := 'a7190000-0000-4000-8000-000000000003';
  visit_id uuid; worker_visit_id uuid; absence_id uuid; v_job_id uuid; assignments jsonb;
begin
  visit_id := public.create_service_visit(tenant,client_id,null,null,null,'Admin visit',admin_id,
    '2091-04-02 08:00+00','2091-04-02 09:00+00','normal','',gen_random_uuid());
  assert exists(select 1 from public.my_assigned_visits(tenant,'2091-04-02','2091-04-02') where id=visit_id), 'Admin sees own visit';
  worker_visit_id := public.create_service_visit(tenant,client_id,null,null,null,'Worker visit',worker_id,
    '2091-04-02 08:00+00','2091-04-02 09:00+00','normal','',gen_random_uuid());
  assert not exists(select 1 from public.my_assigned_visits(tenant,'2091-04-02','2091-04-02') where id=worker_visit_id), 'Personal agenda excludes other people';
  perform public.transition_service_visit(tenant,visit_id,
    (select updated_at from public.service_visits where id=visit_id),'in_progress','',gen_random_uuid());
  perform public.transition_service_visit(tenant,visit_id,
    (select updated_at from public.service_visits where id=visit_id),'completed','',gen_random_uuid());
  assert exists(select 1 from public.service_visits where id=visit_id and status='completed'), 'Admin can complete own visit';
  perform public.update_contract_general_details(tenant,'a7190000-0000-4000-8000-000000000008',
    (select updated_at from public.service_contracts where id='a7190000-0000-4000-8000-000000000008'),
    '2091-01-01','2091-12-31','pending','','a7190000-0000-4000-8000-000000000007',array[admin_id],null,gen_random_uuid());
  v_job_id := public.save_contract_job(tenant,'a7190000-0000-4000-8000-000000000008',null,
    (select updated_at from public.service_contracts where id='a7190000-0000-4000-8000-000000000008'),
    jsonb_build_object('title','Service','tasks','Test','location_id','a7190000-0000-4000-8000-000000000007',
      'modality','mobile','service_type','ordinary','frequency','monthly','anchor_on','2091-01-01',
      'duration_minutes',60,'local_start','09:00','weekdays','[]'::jsonb,'weekly_slots','[]'::jsonb,
      'assigned_user_id',admin_id,'assigned_user_ids',jsonb_build_array(admin_id),'work_team_id',null),gen_random_uuid());
  assert exists(select 1 from public.service_contract_visit_rules where id=v_job_id and admin_id=any(assigned_user_ids)), 'Admin can be assigned to contract work';
  assignments := jsonb_build_array(jsonb_build_object('task_key','job:'||v_job_id::text,'job_id',v_job_id,
    'assigned_user_ids',jsonb_build_array(admin_id),'work_team_id',null));
  perform public.record_contract_signature(tenant,'a7190000-0000-4000-8000-000000000008',
    (select updated_at from public.service_contracts where id='a7190000-0000-4000-8000-000000000008'),
    gen_random_uuid(),p_assignments=>assignments);
  assert exists(select 1 from public.contract_task_assignments where job_id=v_job_id and admin_id=any(assigned_user_ids)), 'Admin assignment survives contract signing';
  absence_id := public.submit_absence_request(tenant,'vacation','2091-04-03','2091-04-03','');
  assert exists(select 1 from public.absence_requests where id=absence_id and requester_id=admin_id), 'Admin can request own absence';
  begin
    perform public.create_service_visit(tenant,client_id,null,null,null,'Other company',outsider,
      '2091-04-02 10:00+00','2091-04-02 11:00+00','normal','',gen_random_uuid());
    raise exception 'Cross-company assignment was accepted';
  exception when sqlstate 'P0409' then null;
  end;
  perform set_config('request.jwt.claim.sub',worker_id::text,true);
  assert not exists(select 1 from public.my_assigned_visits(tenant,'2091-04-02','2091-04-02') where id=visit_id), 'Worker cannot see admin visit';
  assert not exists(select 1 from public.absence_requests where id=absence_id), 'Worker cannot see admin absence';
end;
$$;
rollback;
