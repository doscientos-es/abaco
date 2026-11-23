-- This is deployed disabled. Enable only after the billing functions and the
-- backoffice invoice receiver have been deployed and verified together.
create table app_private.referral_rewards_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into app_private.referral_rewards_config (singleton) values (true);
alter table app_private.referral_rewards_config enable row level security;
revoke all on app_private.referral_rewards_config from public, anon, authenticated;

alter table public.billing_payments
  add column invoice_net_cents integer,
  add column referral_discount_cents integer not null default 0,
  drop constraint billing_payments_amount_cents_check,
  add constraint billing_payments_amount_cents_check check (amount_cents >= 0),
  add constraint billing_payments_referral_discount_check check (
    (referral_discount_cents = 0 and invoice_net_cents is null and amount_cents > 0)
    or (referral_discount_cents > 0 and vat_percent = 21 and net_cents is not null
      and invoice_net_cents is not null and invoice_net_cents >= 0
      and invoice_net_cents < net_cents
      and amount_cents = app_private.billing_total(invoice_net_cents, 21)
      and referral_discount_cents = app_private.billing_total(net_cents, 21) - amount_cents)
  );

create table app_private.referral_invoice_discounts (
  payment_id uuid primary key references public.billing_payments(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  cycle_start timestamptz not null,
  reward_month date not null,
  referred_paid_cents bigint not null check (referred_paid_cents > 0)
);
create index referral_invoice_discounts_cycle_idx
  on app_private.referral_invoice_discounts (tenant_id, cycle_start, reward_month);
alter table app_private.referral_invoice_discounts enable row level security;
revoke all on app_private.referral_invoice_discounts from public, anon, authenticated;

-- Keep the original subscription price in net_cents for subsequent renewals;
-- the invoice gets the discounted taxable base instead.
create or replace function app_private.queue_confirmed_subscription_invoice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare starts_at timestamptz; details jsonb;
begin
  select case when new.kind = 'renewal' then coalesce(t.current_period_end, new.settled_at)
    else new.settled_at end into starts_at from public.tenants t where t.id = new.tenant_id;
  details := case when new.referral_discount_cents > 0 then jsonb_build_object(
    'referralDiscount', jsonb_build_object('originalNetCents', new.net_cents,
      'discountCents', new.referral_discount_cents)) else '{}'::jsonb end;
  update app_private.subscription_invoice_handoffs h set payload = jsonb_build_object(
    'paymentId', new.id, 'tenantId', new.tenant_id, 'order', new.merchant_order,
    'paidAt', new.settled_at, 'plan', new.plan, 'interval', new.period,
    'startsAt', starts_at, 'endsAt', starts_at + case new.period when 'year' then interval '1 year' else interval '1 month' end,
    'netCents', coalesce(new.invoice_net_cents, new.net_cents), 'totalCents', new.amount_cents,
    'vatPercent', new.vat_percent, 'recipient', h.recipient
  ) || details where h.payment_id = new.id;
  if found then update public.billing_payments set invoice_status = 'pending' where id = new.id; end if;
  return new;
end;
$$;

alter function public.reserve_subscription_invoice_payment(uuid,jsonb,text,uuid,text,text,text,integer,integer)
  rename to reserve_subscription_invoice_payment_undiscounted;
revoke all on function public.reserve_subscription_invoice_payment_undiscounted(uuid,jsonb,text,uuid,text,text,text,integer,integer)
  from public, anon, authenticated, service_role;

create function public.reserve_subscription_invoice_payment(
  p_tenant uuid, p_recipient jsonb, p_order text, p_actor uuid, p_action text,
  p_plan text, p_period text, p_seats integer, p_expected_total integer
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  amount integer; pay public.billing_payments; v_cycle_start timestamptz; v_reward_month date;
  referred_paid bigint; breakdown record; result text;
begin
  amount := public.reserve_subscription_invoice_payment_undiscounted(
    p_tenant, p_recipient, p_order, p_actor, p_action, p_plan, p_period, p_seats, p_expected_total);
  if amount is null or not coalesce((select enabled from app_private.referral_rewards_config where singleton), false) then
    return amount;
  end if;
  select * into strict pay from public.billing_payments where merchant_order = p_order;
  select case when pay.kind = 'renewal' then coalesce(current_period_end, now()) else now() end
    into strict v_cycle_start from public.tenants where id = p_tenant;
  v_reward_month := (date_trunc('month', v_cycle_start at time zone 'Europe/Madrid') - interval '1 month')::date;
  if exists (select 1 from app_private.referral_invoice_discounts d
    join public.billing_payments p on p.id = d.payment_id
    where d.tenant_id = p_tenant and d.reward_month = v_reward_month and p.status = 'succeeded') then
    return amount;
  end if;
  select d.referred_paid_cents into referred_paid from app_private.referral_invoice_discounts d
    where d.tenant_id = p_tenant and d.cycle_start = v_cycle_start and d.reward_month = v_reward_month
    order by d.payment_id limit 1;
  if referred_paid is null then
    select coalesce(sum(r.paid_cents), 0) into referred_paid from app_private.referral_card_payments r
      where r.referrer_id = p_tenant and r.paid_month = v_reward_month;
  end if;
  select * into breakdown from app_private.referral_discount_breakdown(pay.net_cents, referred_paid);
  if breakdown.discount_cents = 0 then return amount; end if;
  insert into app_private.referral_invoice_discounts
    (payment_id, tenant_id, cycle_start, reward_month, referred_paid_cents)
    values (pay.id, p_tenant, v_cycle_start, v_reward_month, referred_paid);
  update public.billing_payments set amount_cents = breakdown.total_cents,
    invoice_net_cents = breakdown.net_cents, referral_discount_cents = breakdown.discount_cents
    where id = pay.id;
  if breakdown.total_cents = 0 then
    result := public.apply_billing_payment(p_order, true, 'referral_discount', null);
    if result is distinct from 'succeeded' then
      raise exception 'No se pudo aplicar el descuento' using errcode = 'P0001';
    end if;
  end if;
  return breakdown.total_cents;
end;
$$;
revoke all on function public.reserve_subscription_invoice_payment(uuid,jsonb,text,uuid,text,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.reserve_subscription_invoice_payment(uuid,jsonb,text,uuid,text,text,text,integer,integer)
  to service_role;
notify pgrst, 'reload schema';
