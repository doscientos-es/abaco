begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select throws_ok($$select app_private.validate_weekly_slots('[]')$$,'22023','Marca entre 1 y 56 franjas semanales','Empty weekly schedules are rejected');
select throws_ok($$select app_private.validate_weekly_slots('[{"id":"night","weekday":7,"start_minute":1380,"duration_minutes":120},{"id":"early","weekday":1,"start_minute":0,"duration_minutes":60}]')$$,
  '22023','Las franjas del mismo trabajo no pueden solaparse','Sunday overnight overlaps are checked across week boundaries');
select lives_ok($$select app_private.validate_weekly_slots('[{"id":"night","weekday":7,"start_minute":1380,"duration_minutes":120},{"id":"early","weekday":1,"start_minute":60,"duration_minutes":60}]')$$,'Adjacent overnight shifts are valid');

insert into public.tenants(id,name) values('79000000-0000-4000-8000-000000000001','Weekly contract TEST');
insert into public.clients(id,tenant_id,name) values('79000000-0000-4000-8000-000000000002','79000000-0000-4000-8000-000000000001','Client TEST');
insert into public.service_locations(id,tenant_id,client_id,name,address,timezone) values
  ('79000000-0000-4000-8000-000000000003','79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000002','Centre TEST','Fictional address','Europe/Madrid');
insert into auth.users(id,email) values
  ('79000000-0000-4000-8000-000000000004','weekly-admin@example.test'),
  ('79000000-0000-4000-8000-000000000005','weekly-viewer@example.test');
insert into public.memberships(tenant_id,user_id,role) values
  ('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000004','admin'),
  ('79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000005','viewer');
insert into public.work_teams(id,tenant_id,name) values('79000000-0000-4000-8000-000000000006','79000000-0000-4000-8000-000000000001','Weekly team TEST');

set local role authenticated;
set local request.jwt.claim.sub='79000000-0000-4000-8000-000000000004';
select set_config('test.weekly_contract',public.create_manual_service_contract(
  '79000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000002','79000000-0000-4000-8000-000000000003',null,
  'Split shifts TEST','2027-01-04',null,10000::bigint,'monthly',null,'[]','{}','79000000-0000-4000-8000-000000000007')::text,true);
select set_config('test.weekly_payload','{"title":"Cleaning","tasks":"Clean centre","location_id":"79000000-0000-4000-8000-000000000003","modality":"mobile","service_type":"ordinary","frequency":"weekly","anchor_on":"2027-01-04","local_start":"09:00","duration_minutes":120,"work_team_id":"79000000-0000-4000-8000-000000000006","weekdays":[1,2],"weekly_slots":[{"id":"morning","weekday":1,"start_minute":540,"duration_minutes":120},{"id":"afternoon","weekday":1,"start_minute":900,"duration_minutes":60},{"id":"tuesday","weekday":2,"start_minute":480,"duration_minutes":60}]}',true);
create function pg_temp.save_weekly(p_job uuid,p_payload jsonb,p_operation uuid) returns uuid language sql as $$
  select public.save_contract_job('79000000-0000-4000-8000-000000000001',current_setting('test.weekly_contract')::uuid,p_job,
    (select updated_at from public.service_contracts where id=current_setting('test.weekly_contract')::uuid),p_payload,p_operation)
$$;
select throws_ok($$select pg_temp.save_weekly(null,current_setting('test.weekly_payload')::jsonb,'79000000-0000-4000-8000-000000000010')$$,
  '22023','Guarda primero inicio y fin del contrato','Recurring jobs cannot be saved without the contract end');
select throws_ok($$select public.update_draft_contract_details('79000000-0000-4000-8000-000000000001',current_setting('test.weekly_contract')::uuid,
  (select updated_at from public.service_contracts where id=current_setting('test.weekly_contract')::uuid),'2027-01-04',null,'manual','','79000000-0000-4000-8000-000000000008')$$,
  '22023','Indica inicio y fin del contrato, con una vigencia máxima de 10 años','Agreement edits require a bounded end date');
select public.update_draft_contract_details('79000000-0000-4000-8000-000000000001',current_setting('test.weekly_contract')::uuid,
  (select updated_at from public.service_contracts where id=current_setting('test.weekly_contract')::uuid),'2027-01-04','2028-01-09','manual','','79000000-0000-4000-8000-000000000008');
select throws_ok($$select pg_temp.save_weekly(null,current_setting('test.weekly_payload')::jsonb || '{"work_team_id":null}','79000000-0000-4000-8000-000000000009')$$,
  '22023','Selecciona el equipo que realizará los trabajos','Recurring mobile jobs require a team on the server');
select throws_ok($$select pg_temp.save_weekly(null,current_setting('test.weekly_payload')::jsonb || '{"weekdays":[1]}','79000000-0000-4000-8000-000000000009')$$,
  '22023','Los días no coinciden con el calendario','Calendar days and stored recurrence cannot diverge');
select is(pg_temp.save_weekly(null,current_setting('test.weekly_payload')::jsonb,'79000000-0000-4000-8000-000000000010'),
  '79000000-0000-4000-8000-000000000010'::uuid,'Weekly shifts are saved as one contracted job');
select set_config('test.weekly_changed',jsonb_set(current_setting('test.weekly_payload')::jsonb,'{weekly_slots,0,start_minute}','600')::text,true);
select lives_ok($$select pg_temp.save_weekly('79000000-0000-4000-8000-000000000010',current_setting('test.weekly_changed')::jsonb,'79000000-0000-4000-8000-000000000011')$$,'Draft slots can be changed before activation');
select lives_ok($$select pg_temp.save_weekly(null,current_setting('test.weekly_payload')::jsonb,'79000000-0000-4000-8000-000000000010')$$,'An older operation can be safely retried');
select is((select weekly_slots from public.service_contract_visit_rules where id='79000000-0000-4000-8000-000000000010'),
  current_setting('test.weekly_changed')::jsonb->'weekly_slots','Retrying an old operation never overwrites a later schedule');
select throws_ok($$select pg_temp.save_weekly(null,current_setting('test.weekly_changed')::jsonb,'79000000-0000-4000-8000-000000000010')$$,
  '23505','Operación utilizada','Reused operation ids cannot silently change slots');
select is((select count(*) from public.service_visits where contract_id=current_setting('test.weekly_contract')::uuid),0::bigint,'Draft contracts produce no visits');
select is(public.transition_service_contract('79000000-0000-4000-8000-000000000001',current_setting('test.weekly_contract')::uuid,
  (select updated_at from public.service_contracts where id=current_setting('test.weekly_contract')::uuid),'active','','79000000-0000-4000-8000-000000000012'),
  'active','Activation creates the full schedule in the same transaction');
select is((select count(*) from public.service_visits where contract_id=current_setting('test.weekly_contract')::uuid),159::bigint,'All three weekly shifts are generated across 53 weeks');
select ok((select bool_and(work_team_id='79000000-0000-4000-8000-000000000006') from public.service_visits where contract_id=current_setting('test.weekly_contract')::uuid),'Every occurrence retains the chosen team');
select is((select scheduled_start_at from public.service_visits where contract_id=current_setting('test.weekly_contract')::uuid and contract_occurrence_on='2027-01-04' and contract_slot_key='morning'),
  '2027-01-04 09:00+00'::timestamptz,'The edited Monday slot is generated using the centre timezone');
select is((select count(*) from public.service_visits where contract_id=current_setting('test.weekly_contract')::uuid and contract_occurrence_on='2027-01-04'),2::bigint,'Split shifts on one day keep independent occurrence identities');
select ok((select max(contract_occurrence_on)>'2027-01-04'::date+180 from public.service_visits where contract_id=current_setting('test.weekly_contract')::uuid),'Full activation is not truncated to the old 180-day horizon');
select ok((select bool_and(contract_occurrence_on between '2027-01-04'::date and '2028-01-09'::date) from public.service_visits where contract_id=current_setting('test.weekly_contract')::uuid),'No work is generated outside the agreed term');
select is(public.generate_contract_visits('79000000-0000-4000-8000-000000000001','2027-01-04','2027-03-31'),0,'Later month preparation cannot duplicate activated slots');
select lives_ok($$select public.transition_service_contract('79000000-0000-4000-8000-000000000001',current_setting('test.weekly_contract')::uuid,
  (select updated_at from public.service_contracts where id=current_setting('test.weekly_contract')::uuid),'active','','79000000-0000-4000-8000-000000000012')$$,'Activation retry is idempotent');
select is((select count(*) from public.service_visits where contract_id=current_setting('test.weekly_contract')::uuid),159::bigint,'Activation retry preserves every occurrence exactly once');

set local request.jwt.claim.sub='79000000-0000-4000-8000-000000000005';
select throws_ok($$select pg_temp.save_weekly(null,current_setting('test.weekly_payload')::jsonb,'79000000-0000-4000-8000-000000000013')$$,'42501','No tienes permiso','Viewers cannot configure schedules');
set local role postgres;
select ok(not has_function_privilege('anon','public.save_contract_job(uuid,uuid,uuid,timestamptz,jsonb,uuid)','execute'),'Anonymous users cannot save schedules');
select ok(not has_function_privilege('authenticated','app_private.generate_scheduled_contract_visits(uuid,date,date,uuid)','execute'),'Internal full-range generation is not an authenticated RPC');
select * from finish();
rollback;