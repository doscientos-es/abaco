begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(app_private.cleaning_service_due('2027-02-28','2027-01-31','monthly','{}'), 'Monthly uses February end');
select ok(app_private.cleaning_service_due('2027-03-31','2027-01-31','monthly','{}'), 'Monthly retains original day after February');
select ok(not app_private.cleaning_service_due('2027-03-28','2027-01-31','monthly','{}'), 'Monthly does not drift permanently');
select ok(app_private.cleaning_service_due('2028-02-29','2028-01-31','monthly','{}'), 'Monthly handles leap year');
select ok(app_private.cleaning_service_due('2026-11-26','2026-11-11','days15','{}'), '15 days is an exact interval');
select ok(not app_private.cleaning_service_due('2026-11-25','2026-11-11','days15','{}'), '15 days is not 14 days');
select ok(not app_private.cleaning_service_due('2026-11-16','2026-11-11','fortnightly',array[1]::smallint[]), 'Fortnightly skips the next calendar week');
select ok(app_private.cleaning_service_due('2026-11-23','2026-11-11','fortnightly',array[1]::smallint[]), 'Fortnightly uses the anchor calendar week');

insert into public.tenants(id,name) values('74000000-0000-4000-8000-000000000001','Demo limpieza');
insert into public.clients(id,tenant_id,name) values('74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000001','Comunidad demo');
insert into public.service_locations(id,tenant_id,client_id,name,address,operational_contact,access_notes)
  values('74000000-0000-4000-8000-000000000003','74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002','Centro demo','Calle demo','Conserjería','Entrada lateral');
insert into auth.users(id,email) values('74000000-0000-4000-8000-000000000004','cleaning-admin@example.test');
insert into public.memberships(tenant_id,user_id,role) values('74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000004','admin');

set local role authenticated;
set local request.jwt.claim.sub = '74000000-0000-4000-8000-000000000004';
select set_config('test.cleaning_contract',public.create_manual_service_contract(
  '74000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000003',null,
  'Contrato limpieza','2027-01-01','2027-03-31',10000::bigint,'monthly',null,'[]','{}','74000000-0000-4000-8000-000000000005')::text,true);
select set_config('test.fixed', '{"title":"Limpieza ordinaria","location_id":"74000000-0000-4000-8000-000000000003","modality":"fixed","service_type":"ordinary","frequency":"weekly","anchor_on":"2027-01-01","weekdays":[1,3,5],"duration_minutes":60,"tasks":"Suelos"}',true);
select is(public.add_cleaning_service('74000000-0000-4000-8000-000000000001',current_setting('test.cleaning_contract')::uuid,current_setting('test.fixed')::jsonb,'74000000-0000-4000-8000-000000000006'),
  '74000000-0000-4000-8000-000000000006'::uuid,'Fixed sheet is persisted');
select is(public.add_cleaning_service('74000000-0000-4000-8000-000000000001',current_setting('test.cleaning_contract')::uuid,current_setting('test.fixed')::jsonb,'74000000-0000-4000-8000-000000000006'),
  '74000000-0000-4000-8000-000000000006'::uuid,'Service retry is idempotent');
select throws_ok($$select public.add_cleaning_service('74000000-0000-4000-8000-000000000001',current_setting('test.cleaning_contract')::uuid,current_setting('test.fixed')::jsonb || '{"title":"Cambio"}'::jsonb,'74000000-0000-4000-8000-000000000006')$$,
  '23505','Operación utilizada','Operation keys cannot silently discard changed service data');
select public.add_cleaning_service('74000000-0000-4000-8000-000000000001',current_setting('test.cleaning_contract')::uuid,
  '{"title":"Cristales","location_id":"74000000-0000-4000-8000-000000000003","modality":"mobile","service_type":"windows","frequency":"monthly","anchor_on":"2027-01-31","weekdays":[],"duration_minutes":120,"tasks":"Cristales exteriores","weekly_tasks":{"7":"Revisar acceso"}}',
  '74000000-0000-4000-8000-000000000007');
select public.transition_service_contract('74000000-0000-4000-8000-000000000001',current_setting('test.cleaning_contract')::uuid,
  (select updated_at from public.service_contracts where id=current_setting('test.cleaning_contract')::uuid),'active','','74000000-0000-4000-8000-000000000008');
select is((select count(*) from public.service_visits where contract_id=current_setting('test.cleaning_contract')::uuid),3::bigint,'Activation generates the full mobile service term');
select is(public.generate_contract_visits('74000000-0000-4000-8000-000000000001','2027-01-01','2027-03-31'),0,'Generation is idempotent');
select is((select count(*) from public.service_visits where contract_rule_id='74000000-0000-4000-8000-000000000006'),0::bigint,'Fixed sheets generate no daily visits');
select set_config('test.cleaning_visit',(select id from public.service_visits where contract_id=current_setting('test.cleaning_contract')::uuid and contract_occurrence_on='2027-01-31')::text,true);
select ok((select paper_snapshot->>'tasks' from public.service_visits where id=current_setting('test.cleaning_visit')::uuid) like '%Revisar acceso%','Day-specific tasks are captured on the paper sheet');
select ok((select paper_snapshot->>'instructions' from public.service_visits where id=current_setting('test.cleaning_visit')::uuid) like '%Entrada lateral%','Center access is captured');
select throws_ok($$update public.service_visits set paper_snapshot='{}' where id=current_setting('test.cleaning_visit')::uuid$$,'42501',null,'Direct visit updates are denied');
select set_config('test.cleaning_version',(select updated_at from public.service_visits where id=current_setting('test.cleaning_visit')::uuid)::text,true);
select is(public.update_paper_visit('74000000-0000-4000-8000-000000000001',current_setting('test.cleaning_visit')::uuid,current_setting('test.cleaning_version')::timestamptz,
  '{"action":"complete","performed_on":"2027-02-01","completion_notes":"Realizada en papel"}','74000000-0000-4000-8000-000000000009'),current_setting('test.cleaning_visit')::uuid,'Office records the actual completion date');
select is(public.update_paper_visit('74000000-0000-4000-8000-000000000001',current_setting('test.cleaning_visit')::uuid,current_setting('test.cleaning_version')::timestamptz,
  '{"action":"complete","performed_on":"2027-02-01","completion_notes":"Realizada en papel"}','74000000-0000-4000-8000-000000000009'),current_setting('test.cleaning_visit')::uuid,'Completion retry succeeds even after version changed');
select is((select status from public.service_visits where id=current_setting('test.cleaning_visit')::uuid),'completed','Completion is persisted');
select is((select performed_on from public.service_visits where id=current_setting('test.cleaning_visit')::uuid),'2027-02-01'::date,'Actual date is independent from original occurrence');
select is((select contract_occurrence_on from public.service_visits where id=current_setting('test.cleaning_visit')::uuid),'2027-01-31'::date,'Original recurrence anchor is retained');
select is(public.generate_contract_visits('74000000-0000-4000-8000-000000000001','2027-01-01','2027-03-31'),0,'Completed occurrences are not regenerated');

select * from finish();
rollback;