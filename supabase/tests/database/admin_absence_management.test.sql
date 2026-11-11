begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into public.tenants(id,name) values
  ('75000000-0000-4000-8000-000000000001','Ausencias demo'),
  ('75000000-0000-4000-8000-000000000002','Otra empresa');
insert into auth.users(id,email,raw_user_meta_data) values
  ('75000000-0000-4000-8000-000000000003','absence-admin@example.test','{"full_name":"Administración demo"}'),
  ('75000000-0000-4000-8000-000000000004','absence-ana@example.test','{"full_name":"Ana demo"}'),
  ('75000000-0000-4000-8000-000000000005','absence-bea@example.test','{"full_name":"Bea demo"}'),
  ('75000000-0000-4000-8000-000000000006','absence-other@example.test','{"full_name":"Otro administrador"}');
insert into public.memberships(tenant_id,user_id,role) values
  ('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000003','admin'),
  ('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000004','user'),
  ('75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000005','user'),
  ('75000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000006','admin');
set local role authenticated;
set local request.jwt.claim.sub='75000000-0000-4000-8000-000000000003';
select set_config('test.absence_payload','{"requester_id":"75000000-0000-4000-8000-000000000004","start_date":"2026-11-10","end_date":"2026-11-15","absence_type":"vacation","status":"approved","comment":"Media jornada; sin cálculo de saldo","decision_comment":"Registrada por administración"}',true);
select set_config('test.admin_absence',public.save_administrative_absence('75000000-0000-4000-8000-000000000001',null,null,
  current_setting('test.absence_payload')::jsonb,'75000000-0000-4000-8000-000000000007')::text,true);
select is((select status from public.absence_requests where id=current_setting('test.admin_absence')::uuid),'approved','Office registers a period without worker self-service');
select is((select requester_name from public.absence_requests where id=current_setting('test.admin_absence')::uuid),'Ana demo','Trusted employee name is recorded');
select is(public.save_administrative_absence('75000000-0000-4000-8000-000000000001',null,null,current_setting('test.absence_payload')::jsonb,
  '75000000-0000-4000-8000-000000000007'),current_setting('test.admin_absence')::uuid,'Retry returns the same period');
select is((select count(*) from public.absence_request_history),1::bigint,'Retry does not duplicate audit history');
select throws_ok($$select public.save_administrative_absence('75000000-0000-4000-8000-000000000001',null,null,
  current_setting('test.absence_payload')::jsonb || '{"end_date":"2026-11-20"}'::jsonb,'75000000-0000-4000-8000-000000000007')$$,
  '23505','Operación utilizada','Reused operation keys reject changed payloads');
select set_config('test.absence_version',(select updated_at from public.absence_requests where id=current_setting('test.admin_absence')::uuid)::text,true);
select throws_ok($$select public.save_administrative_absence('75000000-0000-4000-8000-000000000001',current_setting('test.admin_absence')::uuid,current_setting('test.absence_version')::timestamptz,
  current_setting('test.absence_payload')::jsonb || '{"requester_id":"75000000-0000-4000-8000-000000000005"}'::jsonb,'75000000-0000-4000-8000-000000000008')$$,
  '22023','No se puede cambiar el empleado; cancela y registra otro periodo','Audit history cannot be disclosed by transferring a period to another employee');
select is(public.save_administrative_absence('75000000-0000-4000-8000-000000000001',current_setting('test.admin_absence')::uuid,current_setting('test.absence_version')::timestamptz,
  current_setting('test.absence_payload')::jsonb || '{"status":"canceled","decision_comment":"Cambio acordado"}'::jsonb,'75000000-0000-4000-8000-000000000009'),
  current_setting('test.admin_absence')::uuid,'Office can cancel without deleting the period');
select is((select count(*) from public.absence_request_history),2::bigint,'Changes append to history');
select is((select before_state->>'status' from public.absence_request_history where before_state is not null),'approved','History retains the previous state');
select is((select after_state->>'status' from public.absence_request_history where before_state is not null),'canceled','History retains the new state');
select throws_ok($$select public.save_administrative_absence('75000000-0000-4000-8000-000000000001',current_setting('test.admin_absence')::uuid,current_setting('test.absence_version')::timestamptz,
  current_setting('test.absence_payload')::jsonb,'75000000-0000-4000-8000-000000000010')$$,
  'P0409','El periodo cambió; vuelve a cargarlo','Stale changes do not overwrite another administrator');
select throws_ok($$update public.absence_request_history set actor_id=null$$,'42501',null,'Authenticated users cannot rewrite audit history');

set local request.jwt.claim.sub='75000000-0000-4000-8000-000000000004';
select is((select count(*) from public.absence_request_history),2::bigint,'Employee can see their own history');
select throws_ok($$select public.save_administrative_absence('75000000-0000-4000-8000-000000000001',null,null,current_setting('test.absence_payload')::jsonb,
  '75000000-0000-4000-8000-000000000011')$$,'42501','No tienes permiso para gestionar ausencias','Employee cannot use office commands');
set local request.jwt.claim.sub='75000000-0000-4000-8000-000000000005';
select is((select count(*) from public.absence_request_history),0::bigint,'Colleagues cannot see another employee history');
set local request.jwt.claim.sub='75000000-0000-4000-8000-000000000006';
select is((select count(*) from public.absence_request_history),0::bigint,'Other companies cannot read history');
select throws_ok($$select public.save_administrative_absence('75000000-0000-4000-8000-000000000001',null,null,current_setting('test.absence_payload')::jsonb,
  '75000000-0000-4000-8000-000000000012')$$,'42501','No tienes permiso para gestionar ausencias','Other companies cannot write periods');
select * from finish();
rollback;