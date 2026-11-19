begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

insert into auth.users (id,email) values
  ('ed000000-0000-4000-8000-000000000001','bill-admin@example.test'),
  ('ed000000-0000-4000-8000-000000000002','bill-platform@example.test'),
  ('ed000000-0000-4000-8000-000000000003','bill-teammate@example.test');
insert into public.tenants (id,name) values
  ('ed000000-0000-4000-8000-000000000011','Escala test'),
  ('ed000000-0000-4000-8000-000000000012','Another tenant');
insert into public.memberships (tenant_id,user_id,role) values
  ('ed000000-0000-4000-8000-000000000011','ed000000-0000-4000-8000-000000000001','admin'),
  ('ed000000-0000-4000-8000-000000000011','ed000000-0000-4000-8000-000000000003','user');
insert into public.platform_superadmins(user_id) values ('ed000000-0000-4000-8000-000000000002');

set local role anon;
select results_eq($$select seats,monthly_cents,yearly_cents from public.billing_catalog where plan='scale' order by seats$$,
  $$values (25,6900,69000),(50,11900,119000),(75,15900,159000),(100,19900,199000),(150,26900,269000),(200,32900,329000)$$,
  'The public catalogue contains all monthly and annual Scale tiers');
select throws_ok($$update public.billing_catalog set monthly_cents=1 where plan='scale'$$,
  '42501',null,'Anonymous visitors cannot change catalogue prices');

set local role authenticated;
set local request.jwt.claim.sub = 'ed000000-0000-4000-8000-000000000001';
select throws_ok($$select public.billing_preview('ed000000-0000-4000-8000-000000000012')$$,
  '42501','No autorizado','Admins only see billing for their own tenant');
select throws_ok($$select public.superadmin_schedule_billing('ed000000-0000-4000-8000-000000000011','scale','month',25,6100)$$,
  '42501','No autorizado','A tenant admin cannot set an agreed price');
select throws_ok($$update public.tenants set billing_net_cents = 1 where id = 'ed000000-0000-4000-8000-000000000011'$$,
  '42501','El plan se gestiona desde Facturación','Direct tenant edits cannot change the charge');
select throws_ok($$update public.tenants set billing_fixed_net_cents = 1 where id = 'ed000000-0000-4000-8000-000000000011'$$,
  '42501','El plan se gestiona desde Facturación','A tenant cannot write its own fixed price');
select throws_ok($$select public.superadmin_restore_billing_catalog('ed000000-0000-4000-8000-000000000011',6900)$$,
  '42501','No autorizado','Tenant admins cannot restore the catalogue rate');

set local request.jwt.claim.sub = 'ed000000-0000-4000-8000-000000000002';
select lives_ok($$select public.superadmin_schedule_billing('ed000000-0000-4000-8000-000000000011','scale','month',25,6100)$$,
  'Platform staff can record an agreed price without charging');
select is((public.billing_preview('ed000000-0000-4000-8000-000000000011')->'next'->>'amount_cents')::integer,
  7381,'Quote includes VAT on the agreed amount');
reset role;
select is((select count(*) from public.billing_agreement_log),1::bigint,'Agreement is audited');
select is((select count(*) from public.billing_payments where tenant_id='ed000000-0000-4000-8000-000000000011'),0::bigint,'Scheduling never charges');

set local role service_role;
select throws_ok($$select public.billing_manage('ed000000-0000-4000-8000-000000000011','ed000000-0000-4000-8000-000000000001',
  'checkout','scale','month',25,8349,'4321ABCD')$$,'P0001','El importe ha cambiado. Actualiza la página y confirma de nuevo.',
  'A stale or mismatched checkout amount is rejected');
select is(public.billing_manage('ed000000-0000-4000-8000-000000000011','ed000000-0000-4000-8000-000000000001',
  'checkout','scale','month',25,7381,'4321ABCD'),7381,'Checkout reserves the agreed gross amount');
select throws_ok($$select public.billing_manage('ed000000-0000-4000-8000-000000000011','ed000000-0000-4000-8000-000000000001',
  'checkout','scale','month',25,7381,'4321ABCE')$$,'P0001',null,'A second checkout cannot reserve another payment while the first is pending');
select is(public.apply_billing_payment('4321ABCD',true,'0000','test-reference'), 'succeeded','Settlement applies contracted Scale terms');
select is(public.apply_billing_payment('4321ABCD',true,'0000','test-reference'), 'duplicate','Duplicate settlement is idempotent');
select throws_ok($$select public.billing_manage('ed000000-0000-4000-8000-000000000011','ed000000-0000-4000-8000-000000000001',
  'change','solo','month',1,7381,'4321ABCF')$$,'P0403','El plan no cubre el número de personas con acceso',
  'Server rejects a downgrade that would leave members over the limit');

reset role;
update public.billing_catalog set monthly_cents=7900 where plan='scale' and seats=25;
update public.tenants set current_period_end=now()-interval '1 day' where id='ed000000-0000-4000-8000-000000000011';
update public.billing_payments set created_at=now()-interval '2 days' where merchant_order='4321ABCD';
set local role service_role;
select is(public.billing_reserve_renewal('ed000000-0000-4000-8000-000000000011','4321ABCG'),7381,
  'Renewal keeps the subscribed price after the public rate changes');
select is(public.billing_reserve_renewal('ed000000-0000-4000-8000-000000000011','4321ABCH'),null::integer,
  'A duplicate worker cannot reserve a second renewal');

set local role authenticated;
set local request.jwt.claim.sub = 'ed000000-0000-4000-8000-000000000002';
select throws_ok($$select public.superadmin_schedule_billing('ed000000-0000-4000-8000-000000000011','scale','year',25,59000)$$,
  'P0001','Resuelve primero la cancelación o el pago en curso','Platform staff cannot change an in-flight charge');

set local role service_role;
select is(public.apply_billing_payment('4321ABCG',true,'0000',null),'succeeded','Existing renewal settles normally');

set local role authenticated;
select throws_ok($$select public.superadmin_restore_billing_catalog('ed000000-0000-4000-8000-000000000011',6900)$$,
  'P0001','La tarifa de catálogo ha cambiado. Actualiza y confirma de nuevo','Cannot restore a price that has changed');
select lives_ok($$select public.superadmin_restore_billing_catalog('ed000000-0000-4000-8000-000000000011',7900)$$,
  'Platform staff can restore the catalogue rate');
select is((public.billing_preview('ed000000-0000-4000-8000-000000000011')->'next'->>'net_cents')::integer,
  7900,'Restoring the catalogue uses its current price');
select is((public.billing_preview('ed000000-0000-4000-8000-000000000011')->>'fixed_net_cents')::integer,
  null::integer,'Restoration clears the persistent override');
select lives_ok($$select public.superadmin_schedule_billing('ed000000-0000-4000-8000-000000000011','scale','year',25,59000)$$,
  'Platform staff can replace the scheduled rate and switch an active subscriber to annual billing');
select is((public.billing_preview('ed000000-0000-4000-8000-000000000011')->'current'->>'net_cents')::integer,
  6100,'The current paid terms are unchanged');
select is((public.billing_preview('ed000000-0000-4000-8000-000000000011')->'next'->>'amount_cents')::integer,
  71390,'The preview shows the agreed annual price with VAT');

reset role;
select is((select count(*) from public.billing_payments where tenant_id='ed000000-0000-4000-8000-000000000011'),
  2::bigint,'Changing a future price does not create or rewrite a charge');
update public.tenants set current_period_end=now()-interval '1 day' where id='ed000000-0000-4000-8000-000000000011';
update public.billing_payments set created_at=now()-interval '2 days' where tenant_id='ed000000-0000-4000-8000-000000000011';
set local role service_role;
select throws_ok($$select public.billing_manage('ed000000-0000-4000-8000-000000000011','ed000000-0000-4000-8000-000000000001',
  'undo',null,null,null,null,null)$$,'P0001','Contacta con Ábaco para modificar las condiciones programadas',
  'A tenant cannot undo conditions scheduled by the platform');
select is(public.billing_reserve_renewal('ed000000-0000-4000-8000-000000000011','4321ABCI'),71390,
  'The next renewal reserves exactly the newly agreed annual price');
select is(public.apply_billing_payment('4321ABCI',true,'0000',null),'succeeded','The new terms settle successfully');
reset role;
select results_eq($$select billing_interval,billing_net_cents,next_plan from public.tenants where id='ed000000-0000-4000-8000-000000000011'$$,
  $$values ('year'::text,59000,null::text)$$,'Settling the renewal makes the new terms current');

set local role authenticated;
set local request.jwt.claim.sub = 'ed000000-0000-4000-8000-000000000001';
select throws_ok($$select public.superadmin_set_billing_vat('ed000000-0000-4000-8000-000000000011',0)$$,
  '42501','No autorizado','A tenant admin cannot change the subscription VAT');
select throws_ok($$update public.tenants set billing_vat_percent = 0 where id='ed000000-0000-4000-8000-000000000011'$$,
  '42501','El plan se gestiona desde Facturación','The VAT setting cannot be written directly by a tenant');
set local request.jwt.claim.sub = 'ed000000-0000-4000-8000-000000000002';
select throws_ok($$select public.superadmin_set_billing_vat('ed000000-0000-4000-8000-000000000011',10)$$,
  '22023','Selecciona un IVA del 0 % o 21 %','Only the supported VAT rates can be saved');
select lives_ok($$select public.superadmin_set_billing_vat('ed000000-0000-4000-8000-000000000011',0)$$,
  'A platform admin can schedule 0% VAT without changing the base price');
select is((public.billing_preview('ed000000-0000-4000-8000-000000000011')->'current'->>'amount_cents')::integer,
  71390,'The paid period keeps the VAT originally charged');
select lives_ok($$select public.schedule_tenant_module('ed000000-0000-4000-8000-000000000011','procurement',true,1900,19000)$$,
  'The superadmin can still add a module with 0% VAT');
select is((public.billing_preview('ed000000-0000-4000-8000-000000000011')->'next'->>'amount_cents')::integer,
  78000,'The next quote includes the module but does not add VAT');

reset role;
update public.tenants set current_period_end=now()-interval '1 day' where id='ed000000-0000-4000-8000-000000000011';
update public.billing_payments set created_at=now()-interval '2 days' where tenant_id='ed000000-0000-4000-8000-000000000011';
set local role service_role;
select is(public.billing_reserve_renewal('ed000000-0000-4000-8000-000000000011','4321ABCV'),78000,
  'The reserved Redsys renewal equals the net total at 0% VAT');
set local role authenticated;
select throws_ok($$select public.superadmin_set_billing_vat('ed000000-0000-4000-8000-000000000011',21)$$,
  'P0001','Resuelve primero el pago pendiente','VAT cannot change while Redsys is processing the charge');
set local role service_role;
select is(public.apply_billing_payment('4321ABCV',true,'0000',null),'succeeded','The 0% renewal settles');
reset role;
select results_eq($$select vat_percent, net_cents, amount_cents from public.billing_payments
    where merchant_order in ('4321ABCI','4321ABCV') order by merchant_order$$,
  $$values (21,59000,71390),(0,78000,78000)$$,'Each payment retains its own VAT for the receipt');
select is((select billing_paid_vat_percent from public.tenants where id='ed000000-0000-4000-8000-000000000011'),
  0,'Once paid, the paid period reflects the new VAT');
select results_eq($$select billing_fixed_net_cents,next_billing_managed from public.tenants
    where id='ed000000-0000-4000-8000-000000000011'$$,
  $$values (59000,false)$$,'Settlement retains the fixed price and clears the managed change');

set local role service_role;
select throws_ok($$select public.billing_manage('ed000000-0000-4000-8000-000000000011','ed000000-0000-4000-8000-000000000001',
  'change','scale','month',50,59000,null)$$,'P0001','Contacta con Ábaco para cambiar el periodo de una tarifa pactada',
  'The fixed annual price cannot be applied to monthly billing');
select is(public.billing_manage('ed000000-0000-4000-8000-000000000011','ed000000-0000-4000-8000-000000000001',
  'change','scale','year',50,78000,null),78000,'A capacity change keeps the fixed base and module surcharge');
select is(public.billing_manage('ed000000-0000-4000-8000-000000000011','ed000000-0000-4000-8000-000000000001',
  'undo',null,null,null,null,null),0,'The tenant can undo its own capacity change');
reset role;
select results_eq($$select billing_fixed_net_cents,next_plan from public.tenants
    where id='ed000000-0000-4000-8000-000000000011'$$,
  $$values (59000,null::text)$$,'Undo leaves the fixed price unchanged');

insert into public.memberships (tenant_id,user_id,role) values
  ('ed000000-0000-4000-8000-000000000012','ed000000-0000-4000-8000-000000000001','admin');
set local role service_role;
select is(public.billing_manage('ed000000-0000-4000-8000-000000000012','ed000000-0000-4000-8000-000000000001',
  'checkout','solo','month',null,null,'4321ABCJ'),2420,'An older page can still reserve its unchanged published price');
select is(public.apply_billing_payment('4321ABCJ',false,'0100',null),'failed','A failed first payment can be retried');

set local role authenticated;
select public.superadmin_set_billing_vat('ed000000-0000-4000-8000-000000000012',0);
set local request.jwt.claim.sub = 'ed000000-0000-4000-8000-000000000001';
select is(public.can_use_procurement('ed000000-0000-4000-8000-000000000011'),true,'The renewed module is available');
select lives_ok($$select public.schedule_tenant_module('ed000000-0000-4000-8000-000000000011','procurement',false,1900,19000)$$,
  'A tenant admin can turn off a paid module');
select is(public.can_use_procurement('ed000000-0000-4000-8000-000000000011'),true,'Removal preserves access until the paid period ends');
select is((public.billing_preview('ed000000-0000-4000-8000-000000000011')->'next'->>'amount_cents')::integer,
  59000,'The next quote removes the module price');
select throws_ok($$select public.schedule_tenant_module('ed000000-0000-4000-8000-000000000012','procurement',true,1,10)$$,
  'P0001','La tarifa del módulo ha cambiado. Actualiza y confirma de nuevo','An altered module price is rejected');
select lives_ok($$select public.schedule_tenant_module('ed000000-0000-4000-8000-000000000012','procurement',true,1900,19000)$$,
  'A tenant admin can select a module before checkout');
select is(public.can_use_procurement('ed000000-0000-4000-8000-000000000012'),false,'Module access is not granted before payment');

set local role service_role;
select throws_ok($$select public.billing_manage('ed000000-0000-4000-8000-000000000012','ed000000-0000-4000-8000-000000000001',
  'checkout','solo','month',null,null,'4321ABCK')$$,'P0001','El importe ha cambiado. Actualiza la página y confirma de nuevo.',
  'An older page cannot reserve an unconfirmed amount');
select is(public.billing_manage('ed000000-0000-4000-8000-000000000012','ed000000-0000-4000-8000-000000000001',
  'checkout','solo','month',1,3900,'4321ABCK'),3900,'First charge includes the selected module and 0% VAT');
select is(public.apply_billing_payment('4321ABCK',true,'0000',null),'succeeded','The first 0% charge settles');
set local role authenticated;
select is(public.can_use_procurement('ed000000-0000-4000-8000-000000000012'),true,'Payment unlocks the selected module');

select * from finish();
rollback;
