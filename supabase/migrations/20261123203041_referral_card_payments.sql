-- Record the attribution at settlement time; later corrections do not rewrite
-- the historical source of a reward. This does not enable or apply discounts.
create table app_private.referral_card_payments (
  payment_id uuid primary key references public.billing_payments(id) on delete restrict,
  referred_tenant_id uuid not null references public.tenants(id) on delete restrict,
  referrer_id uuid not null references public.tenants(id) on delete restrict,
  paid_cents integer not null check (paid_cents > 0),
  paid_month date not null
);
create index referral_card_payments_month_idx
  on app_private.referral_card_payments(referrer_id, paid_month);
alter table app_private.referral_card_payments enable row level security;
revoke all on app_private.referral_card_payments from public, anon, authenticated;

create function app_private.record_referral_card_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.amount_cents <= 0 or new.settled_at is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('abaco-referral-attributions', 0));
  insert into app_private.referral_card_payments
    (payment_id, referred_tenant_id, referrer_id, paid_cents, paid_month)
  select new.id, new.tenant_id, a.referrer_id, new.amount_cents,
    date_trunc('month', new.settled_at at time zone 'Europe/Madrid')::date
  from app_private.referral_attributions a
  where a.tenant_id = new.tenant_id and a.created_at <= new.settled_at
  on conflict (payment_id) do nothing;
  return new;
end;
$$;
revoke all on function app_private.record_referral_card_payment() from public, anon, authenticated;
create trigger record_referral_card_payment after update of status on public.billing_payments
  for each row when (old.status = 'pending' and new.status = 'succeeded')
  execute function app_private.record_referral_card_payment();

-- Reconstruct historical attribution using the first later audited correction.
-- A correction whose previous value is null means the payment had no referrer.
insert into app_private.referral_card_payments
  (payment_id, referred_tenant_id, referrer_id, paid_cents, paid_month)
select p.id, p.tenant_id,
  case when later.id is not null then later.previous_referrer_id else a.referrer_id end,
  p.amount_cents, date_trunc('month', p.settled_at at time zone 'Europe/Madrid')::date
from public.billing_payments p
left join app_private.referral_attributions a
  on a.tenant_id = p.tenant_id and a.created_at <= p.settled_at
left join lateral (
  select h.id, h.previous_referrer_id from app_private.referral_attribution_audit h
  where h.tenant_id = p.tenant_id and h.changed_at > p.settled_at
  order by h.changed_at, h.id limit 1
) later on true
where p.status = 'succeeded' and p.amount_cents > 0 and p.settled_at is not null
  and (case when later.id is not null then later.previous_referrer_id else a.referrer_id end) is not null
on conflict (payment_id) do nothing;