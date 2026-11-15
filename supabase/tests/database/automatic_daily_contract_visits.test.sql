begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.tenants(id,name) values('ada00000-0000-4000-8000-000000000001','Automatic schedule TEST');
insert into public.clients(id,tenant_id,name) values('ada00000-0000-4000-8000-000000000002','ada00000-0000-4000-8000-000000000001','Client TEST');
insert into public.service_locations(id,tenant_id,client_id,name,address,timezone,opening_schedule) values
  ('ada00000-0000-4000-8000-000000000003','ada00000-0000-4000-8000-000000000001','ada00000-0000-4000-8000-000000000002','Centre TEST','Address TEST','Europe/Madrid',
   '[{"weekday":1,"start":"09:00","end":"18:00"},{"weekday":2,"start":"09:00","end":"18:00"}]');
insert into auth.users(id,email) values
  ('ada00000-0000-4000-8000-000000000004','auto-worker@example.test'),
  ('ada00000-0000-4000-8000-000000000008','auto-admin@example.test');
insert into public.memberships(tenant_id,user_id,role) values
  ('ada00000-0000-4000-8000-000000000001','ada00000-0000-4000-8000-000000000004','technician'),
  ('ada00000-0000-4000-8000-000000000001','ada00000-0000-4000-8000-000000000008','admin');
insert into public.staff_schedules(tenant_id,user_id,slots) values
  ('ada00000-0000-4000-8000-000000000001','ada00000-0000-4000-8000-000000000004','[{"weekday":1,"start":600,"end":1020}]');
insert into public.service_contracts(id,operation_id,tenant_id,client_id,location_id,title,starts_on,ends_on,timezone,price_cents,billing_frequency,source_snapshot,assigned_user_ids,default_assigned_user_id) values
  ('ada00000-0000-4000-8000-000000000005','ada00000-0000-4000-8000-000000000006','ada00000-0000-4000-8000-000000000001','ada00000-0000-4000-8000-000000000002','ada00000-0000-4000-8000-000000000003','Contract TEST','2027-01-04','2027-01-06','Europe/Madrid',100,'monthly','{}',array['ada00000-0000-4000-8000-000000000004'::uuid],'ada00000-0000-4000-8000-000000000004');
set local request.jwt.claim.sub='ada00000-0000-4000-8000-000000000008';
select public.save_contract_job('ada00000-0000-4000-8000-000000000001','ada00000-0000-4000-8000-000000000005',null,
  (select updated_at from public.service_contracts where id='ada00000-0000-4000-8000-000000000005'),
  jsonb_build_object('title','Daily TEST','tasks','Clean','location_id','ada00000-0000-4000-8000-000000000003',
    'modality','mobile','service_type','ordinary','frequency','weekly','anchor_on','2027-01-04',
    'local_start','','duration_minutes',60,'assigned_user_id','ada00000-0000-4000-8000-000000000004',
    'assigned_user_ids',jsonb_build_array('ada00000-0000-4000-8000-000000000004'),'weekdays','[1,2,3,4,5,6,7]'::jsonb,
    'weekly_slots',(select jsonb_agg(jsonb_build_object('id','auto-daily-'||d,'weekday',d,'start_minute',540,'duration_minutes',60) order by d) from generate_series(1,7) d)),
  'ada00000-0000-4000-8000-000000000007');
select is(app_private.automatic_daily_contract_slot('ada00000-0000-4000-8000-000000000001','ada00000-0000-4000-8000-000000000005','ada00000-0000-4000-8000-000000000007','2027-01-04','Europe/Madrid'),
  '{"start_minute":600,"duration_minutes":60}'::jsonb,'Without a preferred time, choose the earliest shared availability');
insert into public.contract_task_assignments(tenant_id,contract_id,task_key,job_id,assigned_user_ids,schedule) values
  ('ada00000-0000-4000-8000-000000000001','ada00000-0000-4000-8000-000000000005','service:test','ada00000-0000-4000-8000-000000000007',array['ada00000-0000-4000-8000-000000000004'::uuid],
   '{"frequency":"weekly","anchor_on":"2027-01-04","weekdays":[1],"start_minute":900,"duration_minutes":60}');
select is(app_private.automatic_daily_contract_slot('ada00000-0000-4000-8000-000000000001','ada00000-0000-4000-8000-000000000005','ada00000-0000-4000-8000-000000000007','2027-01-04','Europe/Madrid'),
  '{"start_minute":900,"duration_minutes":60}'::jsonb,'An available task preference is respected');
select is(public.transition_service_contract('ada00000-0000-4000-8000-000000000001','ada00000-0000-4000-8000-000000000005',
  (select updated_at from public.service_contracts where id='ada00000-0000-4000-8000-000000000005'),'active','','ada00000-0000-4000-8000-000000000009'),
  'active','Activation generates daily visits');
select is((select count(*) from public.service_visits where contract_id='ada00000-0000-4000-8000-000000000005'),1::bigint,'Only days with centre and staff availability are scheduled');
select is((select scheduled_start_at from public.service_visits where contract_id='ada00000-0000-4000-8000-000000000005'),
  '2027-01-04 14:00+00'::timestamptz,'The selected start respects the centre timezone');
select is((select count(*) from public.service_contract_generation_issues where contract_id='ada00000-0000-4000-8000-000000000005'),2::bigint,'Unavailable days are reported as conflicts');
select is(app_private.generate_scheduled_contract_visits('ada00000-0000-4000-8000-000000000001','2027-01-04','2027-01-06','ada00000-0000-4000-8000-000000000005'),0,'Retry does not duplicate visits');
select * from finish();
rollback;