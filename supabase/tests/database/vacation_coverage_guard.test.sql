begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.tenants(id,name) values ('a4000000-0000-4000-8000-000000000001','Cobertura');
insert into public.clients(id,tenant_id,name) values
  ('a4000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000001','Cliente');
insert into auth.users(id,email,raw_user_meta_data) values
  ('a4000000-0000-4000-8000-000000000003','coverage-guard-admin@example.test','{"full_name":"Administración"}'),
  ('a4000000-0000-4000-8000-000000000004','coverage-guard-worker@example.test','{"full_name":"Trabajador"}'),
  ('a4000000-0000-4000-8000-000000000005','coverage-guard-backup@example.test','{"full_name":"Sustituto"}');
insert into public.memberships(tenant_id,user_id,role) values
  ('a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000003','admin'),
  ('a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000004','technician'),
  ('a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000005','technician');
insert into public.work_teams(id,tenant_id,name) values
  ('a4000000-0000-4000-8000-000000000006','a4000000-0000-4000-8000-000000000001','Equipo');
insert into public.work_team_members(tenant_id,team_id,user_id) values
  ('a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000006','a4000000-0000-4000-8000-000000000004');
insert into public.service_visits(id,operation_id,tenant_id,client_id,title,assigned_user_id,work_team_id,scheduled_start_at,scheduled_end_at,created_by) values
  ('a4000000-0000-4000-8000-000000000007','a4000000-0000-4000-8000-000000000008','a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','Nocturna','a4000000-0000-4000-8000-000000000004',null,'2040-06-10 21:30+00','2040-06-10 22:30+00','a4000000-0000-4000-8000-000000000003'),
  ('a4000000-0000-4000-8000-000000000009','a4000000-0000-4000-8000-000000000010','a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','Equipo',null,'a4000000-0000-4000-8000-000000000006','2040-06-12 08:00+00','2040-06-12 09:00+00','a4000000-0000-4000-8000-000000000003');

set local role authenticated;
set local request.jwt.claim.sub='a4000000-0000-4000-8000-000000000004';
select set_config('test.coverage_request',public.submit_absence_request(
  'a4000000-0000-4000-8000-000000000001','vacation','2040-06-11','2040-06-12','')::text,true);
set local request.jwt.claim.sub='a4000000-0000-4000-8000-000000000003';
select is((select count(*) from public.list_vacation_coverage('a4000000-0000-4000-8000-000000000001',current_setting('test.coverage_request')::uuid)),2::bigint,'The review includes overnight and team visits');
select is((select candidates from public.list_vacation_coverage('a4000000-0000-4000-8000-000000000001',current_setting('test.coverage_request')::uuid) where title='Equipo'),'[]'::jsonb,'Team replacement is not presented as a single-person substitution');
select throws_ok($$select public.decide_vacation_request('a4000000-0000-4000-8000-000000000001',current_setting('test.coverage_request')::uuid,'approved','')$$,
  'P0411','Reasigna todas las visitas afectadas antes de aprobar las vacaciones','Approval is blocked while visits are affected');
select throws_ok($$select public.save_administrative_absence('a4000000-0000-4000-8000-000000000001',null,null,
  '{"requester_id":"a4000000-0000-4000-8000-000000000004","start_date":"2040-06-11","end_date":"2040-06-12","absence_type":"vacation","status":"approved"}'::jsonb,'a4000000-0000-4000-8000-000000000011')$$,
  'P0411','Reasigna todas las visitas afectadas antes de aprobar las vacaciones','Administrative creation cannot bypass the guard');
reset role;
update public.service_visits set assigned_user_id='a4000000-0000-4000-8000-000000000005' where id='a4000000-0000-4000-8000-000000000007';
set local role authenticated;
select throws_ok($$select public.decide_vacation_request('a4000000-0000-4000-8000-000000000001',current_setting('test.coverage_request')::uuid,'approved','')$$,
  'P0411','Reasigna todas las visitas afectadas antes de aprobar las vacaciones','A team visit still blocks approval');
reset role;
update public.service_visits set work_team_id=null,assigned_user_id='a4000000-0000-4000-8000-000000000005' where id='a4000000-0000-4000-8000-000000000009';
set local role authenticated;
select is(public.decide_vacation_request('a4000000-0000-4000-8000-000000000001',current_setting('test.coverage_request')::uuid,'approved',''),current_setting('test.coverage_request')::uuid,'Approval succeeds after every affected visit is covered');
select * from finish();
rollback;