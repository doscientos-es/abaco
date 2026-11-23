-- Synthetic payments only: no Redsys request or invoice handoff is created.
begin;
do $$
declare
  v_tenant constant uuid := 'ae200000-0000-4000-8000-000000000001';
  v_admin constant uuid := 'ae200000-0000-4000-8000-000000000002';
  v_total integer;
  v_start timestamptz;
  v_end timestamptz;
  v_tenant_end timestamptz;
begin
  insert into auth.users (id,email) values (v_admin,'billing-cycle@example.test');
  insert into public.tenants (id,name) values (v_tenant,'Billing cycle transaction test');
  insert into public.memberships (tenant_id,user_id,role) values (v_tenant,v_admin,'admin');
  v_total := app_private.billing_total(public.billing_catalog_net('standard',1,'month'),21);
  if public.billing_manage(v_tenant,v_admin,'checkout','standard','month',1,v_total,'1111CYC0') <> v_total then
    raise exception 'Failed-payment reservation mismatch';
  end if;
  if public.apply_billing_payment('1111CYC0',false,'9999',null) <> 'failed' then
    raise exception 'Failed payment was not recorded';
  end if;
  if exists (select 1 from app_private.billing_paid_cycles where tenant_id=v_tenant) then
    raise exception 'Cycle recorded after failed payment';
  end if;
  if public.billing_manage(v_tenant,v_admin,'checkout','standard','month',1,v_total,'1111CYC1') <> v_total then
    raise exception 'Checkout reservation mismatch';
  end if;
  if exists (select 1 from app_private.billing_paid_cycles where tenant_id=v_tenant) then
    raise exception 'Cycle recorded before payment';
  end if;
  if public.apply_billing_payment('1111CYC1',true,'0000','test-reference') <> 'succeeded' then
    raise exception 'First payment failed';
  end if;
  select starts_at,ends_at into strict v_start,v_end from app_private.billing_paid_cycles where tenant_id=v_tenant;
  select current_period_end into strict v_tenant_end from public.tenants where id=v_tenant;
  if v_start <> now() or v_end <> v_tenant_end then raise exception 'First cycle dates mismatch'; end if;
  if public.apply_billing_payment('1111CYC1',true,'0000',null) <> 'duplicate' then
    raise exception 'Duplicate not rejected';
  end if;
  update public.billing_payments set created_at=now()-interval '2 days' where tenant_id=v_tenant;
  update public.tenants set current_period_end='2026-02-28T12:00:00Z' where id=v_tenant;
  if public.billing_reserve_renewal(v_tenant,'1111CYC2') <> v_total then
    raise exception 'Renewal reservation mismatch';
  end if;
  if public.apply_billing_payment('1111CYC2',true,'0000',null) <> 'succeeded' then
    raise exception 'Renewal failed';
  end if;
  select starts_at,ends_at into strict v_start,v_end from app_private.billing_paid_cycles where tenant_id=v_tenant;
  select current_period_end into strict v_tenant_end from public.tenants where id=v_tenant;
  if v_start <> '2026-02-28T12:00:00Z'::timestamptz or v_end <> v_tenant_end then
    raise exception 'Renewal cycle dates mismatch';
  end if;
end $$;
rollback;