-- Recipient of Doscientos subscription invoices, not the tenant's own issuer settings.
create table public.subscription_billing_profiles (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  legal_name text not null check (length(btrim(legal_name)) between 1 and 160),
  tax_id text not null check (tax_id ~ '^[A-Z0-9]{9}$'),
  street text not null check (length(btrim(street)) between 1 and 250),
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  city text not null check (length(btrim(city)) between 1 and 120),
  province text not null check (length(btrim(province)) between 1 and 120),
  email text not null check (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

alter table public.subscription_billing_profiles enable row level security;
revoke all on public.subscription_billing_profiles from public, anon, authenticated;
grant select, insert, update on public.subscription_billing_profiles to authenticated;
create policy subscription_billing_profiles_admin on public.subscription_billing_profiles
  for all to authenticated using (public.has_role(tenant_id, array['owner','admin']::public.app_role[]))
  with check (public.has_role(tenant_id, array['owner','admin']::public.app_role[]));

alter table public.billing_payments
  add column invoice_number text,
  add column invoice_portal_url text;

create table app_private.subscription_invoice_handoffs (
  payment_id uuid primary key references public.billing_payments(id) on delete restrict,
  recipient jsonb not null,
  payload jsonb,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  lease_id uuid,
  lease_until timestamptz,
  completed_at timestamptz,
  last_error text
);

create index subscription_invoice_handoffs_pending_idx
  on app_private.subscription_invoice_handoffs (next_attempt_at)
  where payload is not null and completed_at is null;

-- Capture who is being charged before Redsys redirects the customer away.
create function app_private.capture_subscription_invoice_recipient() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into app_private.subscription_invoice_handoffs(payment_id, recipient)
  select new.id, to_jsonb(profile) - 'tenant_id'
    from public.subscription_billing_profiles profile where profile.tenant_id = new.tenant_id;
  return new;
end;
$$;

create trigger capture_subscription_invoice_recipient after insert on public.billing_payments
  for each row execute function app_private.capture_subscription_invoice_recipient();

-- The original settlement RPC updates billing_payments before advancing the tenant's period.
create function app_private.queue_confirmed_subscription_invoice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare starts_at timestamptz;
begin
  select case when new.kind = 'renewal' then coalesce(t.current_period_end, new.settled_at)
    else new.settled_at end into starts_at from public.tenants t where t.id = new.tenant_id;
  update app_private.subscription_invoice_handoffs h set payload = jsonb_build_object(
    'paymentId', new.id, 'tenantId', new.tenant_id, 'order', new.merchant_order,
    'paidAt', new.settled_at, 'plan', new.plan, 'interval', new.period,
    'startsAt', starts_at, 'endsAt', starts_at + case new.period when 'year' then interval '1 year' else interval '1 month' end,
    'netCents', new.net_cents, 'totalCents', new.amount_cents, 'vatPercent', new.vat_percent,
    'recipient', h.recipient
  ) where h.payment_id = new.id;
  return new;
end;
$$;

create trigger queue_confirmed_subscription_invoice after update of status on public.billing_payments
  for each row when (old.status = 'pending' and new.status = 'succeeded')
  execute function app_private.queue_confirmed_subscription_invoice();

create function public.claim_subscription_invoice_handoff()
returns table (payment_id uuid, lease_id uuid, payload jsonb)
language sql security definer set search_path = '' as $$
  update app_private.subscription_invoice_handoffs h
     set lease_id = gen_random_uuid(), lease_until = now() + interval '5 minutes', attempts = attempts + 1
   where h.payment_id = (
     select q.payment_id from app_private.subscription_invoice_handoffs q
     where q.payload is not null and q.completed_at is null and q.next_attempt_at <= now()
       and (q.lease_until is null or q.lease_until < now())
     order by q.next_attempt_at, q.payment_id limit 1 for update skip locked)
  returning h.payment_id, h.lease_id, h.payload;
$$;

create function public.finish_subscription_invoice_handoff(
  p_payment uuid, p_lease uuid, p_number text, p_url text, p_complete boolean, p_error text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update app_private.subscription_invoice_handoffs
     set lease_id = null, lease_until = null, last_error = p_error,
         completed_at = case when p_complete then now() else null end,
         next_attempt_at = now() + make_interval(mins => least(60, attempts * 5))
   where payment_id = p_payment and lease_id = p_lease;
  if not found then return false; end if;
  if p_number is not null and p_url is not null then
    update public.billing_payments set invoice_number = p_number, invoice_portal_url = p_url
      where id = p_payment;
  end if;
  return true;
end;
$$;

revoke all on function public.claim_subscription_invoice_handoff() from public, anon, authenticated;
revoke all on function public.finish_subscription_invoice_handoff(uuid,uuid,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.claim_subscription_invoice_handoff() to service_role;
grant execute on function public.finish_subscription_invoice_handoff(uuid,uuid,text,text,boolean,text) to service_role;