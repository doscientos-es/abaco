-- Disposable fixtures and changes are rolled back, including the replanned visit.
begin;
set local plpgsql.check_asserts=on;
do $$
declare
  t uuid:=gen_random_uuid(); cl uuid:=gen_random_uuid(); loc uuid:=gen_random_uuid();
  admin uuid:=gen_random_uuid(); team uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
  job uuid; v uuid; omitted uuid; omitted_version timestamptz;
  skip_op uuid:=gen_random_uuid(); next_visit jsonb;
  payload jsonb; version timestamptz; op uuid:=gen_random_uuid();
begin
  insert into public.tenants(id,name,is_complimentary) values(t,'Preferred weekday test',true);
  insert into public.clients(id,tenant_id,name) values(cl,t,'Test client');
  insert into public.service_locations(id,tenant_id,client_id,name,address,timezone)
    values(loc,t,cl,'Test centre','Test address','Europe/Madrid');
  insert into auth.users(id,email) values(admin,admin::text||'@example.test');
  insert into public.memberships(tenant_id,user_id,role) values(t,admin,'admin');
  insert into public.work_teams(id,tenant_id,name) values(team,t,'Test team');
  insert into public.service_contracts(id,operation_id,tenant_id,client_id,location_id,work_team_id,
    title,starts_on,ends_on,price_cents,billing_frequency,timezone,source_snapshot)
    values(c,gen_random_uuid(),t,cl,loc,team,'Test contract','2027-01-01','2027-03-31',10000,'monthly','Europe/Madrid','{}');
  perform set_config('request.jwt.claim.sub',admin::text,true);
  payload:=jsonb_build_object('title','Windows','tasks','Clean','location_id',loc,
    'modality','mobile','service_type','ordinary','frequency','monthly','anchor_on','2027-01-01',
    'duration_minutes',60,'local_start','09:00','weekdays',jsonb_build_array(1),'weekly_slots','[]'::jsonb,
    'assigned_user_id',null,'assigned_user_ids','[]'::jsonb,'work_team_id',team);
  select updated_at into version from public.service_contracts where id=c;
  begin
    perform public.save_contract_job(t,c,null,version,jsonb_set(payload,'{weekdays}','[8]'),gen_random_uuid());
    raise exception 'Invalid weekday was accepted';
  exception when sqlstate '22023' then null; end;
  job:=public.save_contract_job(t,c,null,version,payload,op);
  assert (select weekdays=array[1]::smallint[] from public.service_contract_visit_rules where id=job), 'Preference was not saved';
  perform public.transition_service_contract(t,c,(select updated_at from public.service_contracts where id=c),'active','',gen_random_uuid());
  assert (select array_agg(contract_occurrence_on order by contract_occurrence_on)=array['2027-01-04','2027-02-01','2027-03-01']::date[]
    from public.service_visits where contract_rule_id=job), 'Incorrect generated dates';
  select id into v from public.service_visits where contract_rule_id=job and contract_occurrence_on='2027-02-01';
  perform public.replan_service_visit_local(t,v,(select updated_at from public.service_visits where id=v),
    '2027-02-03 10:00',60,null,'Client request',gen_random_uuid());
  assert (select contract_occurrence_on='2027-02-01' and (scheduled_start_at at time zone 'Europe/Madrid')::date='2027-02-03'
    from public.service_visits where id=v), 'Replanning lost origin';
  select id, updated_at into strict omitted, omitted_version from public.service_visits
    where contract_rule_id=job and contract_occurrence_on='2027-01-04';
  select to_jsonb(vs) into strict next_visit from public.service_visits vs
    where contract_rule_id=job and contract_occurrence_on='2027-03-01';
  assert public.transition_service_visit(t,omitted,omitted_version,'skipped','Client closed',skip_op,null,null)='skipped',
    'Office could not omit just one occurrence';
  assert public.transition_service_visit(t,omitted,omitted_version,'skipped','Client closed',skip_op,null,null)='skipped',
    'Retry of occurrence omission did not return the original result';
  assert (select count(*)=1 and min(ev.payload->>'reason')='Client closed' from public.service_visit_events ev
    where visit_id=omitted and operation_id=skip_op and kind='status_changed'), 'Omission history duplicated or lost';
  perform app_private.generate_scheduled_contract_visits(t,'2027-01-01','2027-03-31',c);
  perform public.save_contract_job(t,c,null,version,payload,op);
  assert (select count(*)=3 from public.service_visits where contract_rule_id=job), 'Regeneration duplicated a moved or omitted visit';
  assert (select status='skipped' and contract_occurrence_on='2027-01-04' and contract_rule_id=job
    from public.service_visits where id=omitted), 'Omission lost its original series reference';
  assert (select to_jsonb(vs)=next_visit from public.service_visits vs where contract_rule_id=job
    and contract_occurrence_on='2027-03-01'), 'Other occurrences changed after an exception';
  assert app_private.cleaning_service_due('2027-02-28','2027-01-31','monthly','{}'::smallint[]), 'Legacy monthly rule changed';
  assert not app_private.cleaning_service_due('2027-02-08','2027-01-01','monthly',array[1]::smallint[]), 'Second Monday was included';
  assert not app_private.cleaning_service_due('2027-02-01','2027-02-02','monthly',array[1]::smallint[]), 'Occurrence predates the contract';
end $$;
select '1..1' as result union all select 'ok 1 - Preferred weekdays and single occurrence exceptions';
rollback;