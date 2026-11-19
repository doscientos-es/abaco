begin;
set local plpgsql.check_asserts = on;
insert into public.tenants(id,name,is_complimentary) values ('e0190000-0000-4000-8000-000000000001','Move test',true);
insert into public.clients(id,tenant_id,name) values ('e0190000-0000-4000-8000-000000000002','e0190000-0000-4000-8000-000000000001','Client');
insert into auth.users(id,email) values ('e0190000-0000-4000-8000-000000000003','move-contract-test@example.test');
insert into public.memberships(tenant_id,user_id,role) values ('e0190000-0000-4000-8000-000000000001','e0190000-0000-4000-8000-000000000003','admin');
insert into public.service_contracts(id,operation_id,tenant_id,client_id,title,starts_on,ends_on,price_cents,billing_frequency,timezone,source_snapshot)
values ('e0190000-0000-4000-8000-000000000004',gen_random_uuid(),'e0190000-0000-4000-8000-000000000001','e0190000-0000-4000-8000-000000000002','Contract','2091-01-01','2091-12-31',10000,'monthly','Europe/Madrid','{}');
insert into public.service_contract_visit_rules(id,tenant_id,contract_id,season,months,weekday,local_start,duration_minutes,title) values
('e0190000-0000-4000-8000-000000000007','e0190000-0000-4000-8000-000000000001','e0190000-0000-4000-8000-000000000004','high',array[4]::smallint[],1,'09:00',60,'One'),
('e0190000-0000-4000-8000-000000000008','e0190000-0000-4000-8000-000000000001','e0190000-0000-4000-8000-000000000004','high',array[4]::smallint[],2,'10:00',60,'Two');
insert into public.service_visits(id,operation_id,tenant_id,client_id,contract_id,contract_rule_id,contract_occurrence_on,contract_schedule_version,title,assigned_user_id,scheduled_start_at,scheduled_end_at) values
('e0190000-0000-4000-8000-000000000005',gen_random_uuid(),'e0190000-0000-4000-8000-000000000001','e0190000-0000-4000-8000-000000000002','e0190000-0000-4000-8000-000000000004','e0190000-0000-4000-8000-000000000007','2091-04-02',1,'One','e0190000-0000-4000-8000-000000000003','2091-04-02 08:00+00','2091-04-02 09:00+00'),
('e0190000-0000-4000-8000-000000000006',gen_random_uuid(),'e0190000-0000-4000-8000-000000000001','e0190000-0000-4000-8000-000000000002','e0190000-0000-4000-8000-000000000004','e0190000-0000-4000-8000-000000000008','2091-04-02',1,'Two','e0190000-0000-4000-8000-000000000003','2091-04-02 09:00+00','2091-04-02 10:00+00');
insert into public.service_visits(id,operation_id,tenant_id,client_id,title,assigned_user_id,scheduled_start_at,scheduled_end_at) values
('e0190000-0000-4000-8000-000000000009',gen_random_uuid(),'e0190000-0000-4000-8000-000000000001','e0190000-0000-4000-8000-000000000002','Conflict','e0190000-0000-4000-8000-000000000003','2091-04-03 09:30+00','2091-04-03 09:45+00');
set local role authenticated;
set local request.jwt.claim.sub = 'e0190000-0000-4000-8000-000000000003';
do $$
declare snapshot jsonb;
begin
 select jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) order by id) into snapshot from public.service_visits where contract_id='e0190000-0000-4000-8000-000000000004';
 begin
   perform public.replan_contract_day('e0190000-0000-4000-8000-000000000001','e0190000-0000-4000-8000-000000000004','2091-04-02',snapshot,1440,gen_random_uuid());
   raise exception 'Conflict accepted';
 exception when sqlstate 'P0409' then null; end;
 assert (select max(scheduled_start_at) from public.service_visits where contract_id='e0190000-0000-4000-8000-000000000004') = '2091-04-02 09:00+00'::timestamptz, 'Conflict must roll back all jobs';
end $$;
reset role;
delete from public.service_visits where id='e0190000-0000-4000-8000-000000000009';
set local role authenticated;
set local request.jwt.claim.sub = 'e0190000-0000-4000-8000-000000000003';
do $$
declare
  tenant constant uuid := 'e0190000-0000-4000-8000-000000000001';
  contract constant uuid := 'e0190000-0000-4000-8000-000000000004';
  operation_id uuid := gen_random_uuid();
  snapshot jsonb;
begin
  select jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at) order by id) into snapshot from public.service_visits where contract_id=contract;
  begin
    perform public.replan_contract_day(tenant,contract,'2091-04-02',jsonb_build_array(snapshot->0, snapshot->0),60,gen_random_uuid());
    raise exception 'Duplicate visits accepted';
  exception when sqlstate 'P0409' then null; end;
  perform public.replan_contract_day(tenant,contract,'2091-04-02',snapshot,60,operation_id);
  assert (select min(scheduled_start_at) from public.service_visits where contract_id=contract) = '2091-04-02 09:00+00'::timestamptz, 'Both jobs must shift';
  assert (select max(scheduled_start_at) from public.service_visits where contract_id=contract) = '2091-04-02 10:00+00'::timestamptz, 'Both jobs must shift';
  perform public.replan_contract_day(tenant,contract,'2091-04-02',snapshot,60,operation_id);
  assert (select min(scheduled_start_at) from public.service_visits where contract_id=contract) = '2091-04-02 09:00+00'::timestamptz, 'Retry must not move twice';
  begin
    perform public.replan_contract_day(tenant,contract,'2091-04-02',snapshot,60,gen_random_uuid());
    raise exception 'Stale version accepted';
  exception when sqlstate 'P0409' then null; end;
end $$;
rollback;


