begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.tenants(id,name,is_complimentary) values
  ('e1000000-0000-4000-8000-000000000001','Worker company',true),
  ('e1000000-0000-4000-8000-000000000002','Other company',true);
insert into auth.users(id,email) values
  ('e1000000-0000-4000-8000-000000000003','worker-admin@example.test'),
  ('e1000000-0000-4000-8000-000000000004','worker-user@example.test'),
  ('e1000000-0000-4000-8000-000000000005','worker-other@example.test'),
  ('e1000000-0000-4000-8000-000000000006','worker-invite@example.test');
insert into public.memberships(tenant_id,user_id,role) values
  ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','admin'),
  ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','user'),
  ('e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000005','admin');

set local role authenticated;
set local request.jwt.claim.sub='e1000000-0000-4000-8000-000000000003';
select lives_ok($$select public.save_worker_personal_data('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004',' 12345678Z ','')$$,'Admin completes an existing worker with no phone');
select is((select dni from public.worker_personal_data where worker_id='e1000000-0000-4000-8000-000000000004'),'12345678Z','DNI is trimmed');
select throws_ok($$select public.save_worker_personal_data('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','  ','')$$,'22023',null,'Blank DNI rejected');
select throws_ok($$select public.save_worker_personal_data('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000005','123','')$$,'22023',null,'Cannot save a non-member');
select throws_ok($$insert into public.worker_personal_data(tenant_id,worker_id,dni) values ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000003','123')$$,'42501',null,'Direct writes forbidden');
select throws_ok($$select public.register_invited_worker('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000003','user','123','')$$,'42501',null,'Registration is service-only');
set local request.jwt.claim.sub='e1000000-0000-4000-8000-000000000004';
select is((select count(*) from public.worker_personal_data),0::bigint,'Ordinary user cannot read personal data');
select throws_ok($$select public.save_worker_personal_data('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','123','')$$,'42501',null,'Ordinary user cannot write personal data');
set local request.jwt.claim.sub='e1000000-0000-4000-8000-000000000005';
select is((select count(*) from public.worker_personal_data),0::bigint,'Other company cannot read personal data');

set local role service_role;
select throws_ok($$select public.register_invited_worker('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000003','user','','')$$,'22023',null,'Invitation requires DNI');
select lives_ok($$select public.register_invited_worker('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000003','user','B123','')$$,'Invitation creates member and data');
select throws_ok($$select public.register_invited_worker('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000003','admin','OTHER','')$$,'23505',null,'Repeat invitation does not overwrite data or role');
reset role;
select is((select dni from public.worker_personal_data where worker_id='e1000000-0000-4000-8000-000000000006'),'B123','Original DNI preserved');
select is((select role::text from public.memberships where user_id='e1000000-0000-4000-8000-000000000006'),'user','Original role preserved');
select * from finish();
rollback;