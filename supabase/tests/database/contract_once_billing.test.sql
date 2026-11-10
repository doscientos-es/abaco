begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.tenants(id,name) values('76000000-0000-4000-8000-000000000001','Single fee TEST');
insert into public.clients(id,tenant_id,name) values('76000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000001','Client TEST');
insert into auth.users(id,email) values('76000000-0000-4000-8000-000000000003','single-fee-admin@example.test');
insert into public.memberships(tenant_id,user_id,role) values('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000003','admin');
insert into public.service_contracts(id,operation_id,tenant_id,client_id,title,status,starts_on,ends_on,timezone,price_cents,billing_frequency,source_snapshot,created_by) values
  ('76000000-0000-4000-8000-000000000010',gen_random_uuid(),'76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002','Resumed one-off','active',current_date,current_date+10,'Europe/Madrid',10000,'once','{"estimate":{"vat_rate":21}}','76000000-0000-4000-8000-000000000003'),
  ('76000000-0000-4000-8000-000000000020',gen_random_uuid(),'76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002','Backdated one-off','active',current_date-10,current_date,'Europe/Madrid',10000,'once','{"estimate":{"vat_rate":21}}','76000000-0000-4000-8000-000000000003');
-- Explicit status history: the current active state must not hide an interruption.
insert into public.service_contract_events(operation_id,tenant_id,contract_id,kind,payload,actor_id) values
  (gen_random_uuid(),'76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000010','status_changed','{"to":"active"}','76000000-0000-4000-8000-000000000003'),
  (gen_random_uuid(),'76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000010','status_changed','{"to":"paused"}','76000000-0000-4000-8000-000000000003'),
  (gen_random_uuid(),'76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000010','status_changed','{"to":"active"}','76000000-0000-4000-8000-000000000003'),
  (gen_random_uuid(),'76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000020','status_changed','{"to":"active"}','76000000-0000-4000-8000-000000000003');

set local role authenticated;
set local request.jwt.claim.sub='76000000-0000-4000-8000-000000000003';
select is(public.generate_contract_billing_periods('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000010',current_date+9),0,'No obligation is generated before the agreed period closes');
select is(public.generate_contract_billing_periods('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000010',current_date+10),1,'A resumed agreement has exactly one obligation');
select is((select pricing_status from public.contract_billing_periods where contract_id='76000000-0000-4000-8000-000000000010'),'requires_review','Resuming does not silently charge the full price');
select ok((select net_cents is null from public.contract_billing_periods where contract_id='76000000-0000-4000-8000-000000000010'),'Interrupted price requires an explicit review');
select is(public.generate_contract_billing_periods('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000020',current_date),1,'Backdating still creates a single obligation');
select is((select pricing_status from public.contract_billing_periods where contract_id='76000000-0000-4000-8000-000000000020'),'requires_review','A period before activation requires price review');
select * from finish();
rollback;