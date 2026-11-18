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
grant select on public.subscription_billing_profiles to service_role;
create policy subscription_billing_profiles_admin on public.subscription_billing_profiles
  for all to authenticated using (public.has_role(tenant_id, array['owner','admin']::public.app_role[]))
  with check (public.has_role(tenant_id, array['owner','admin']::public.app_role[]));

alter table public.billing_payments
  add column invoice_number text,
  add column invoice_portal_url text,
  add column invoice_status text check (invoice_status in (
    'pending', 'retrying', 'fiscal_pending', 'fiscal_review', 'invoice_review',
    'email_pending', 'email_review', 'sent'
  ));

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
  if current_setting('app.abaco_invoice_reservation', true) is distinct from new.merchant_order then
    return new;
  end if;
  insert into app_private.subscription_invoice_handoffs(payment_id, recipient)
  select new.id, to_jsonb(profile) - 'tenant_id'
    from public.subscription_billing_profiles profile where profile.tenant_id = new.tenant_id;
  return new;
end;
$$;

create trigger capture_subscription_invoice_recipient after insert on public.billing_payments
  for each row execute function app_private.capture_subscription_invoice_recipient();

-- Roll back the reservation if the profile changed during the remote preflight.
create function public.reserve_subscription_invoice_payment(
  p_tenant uuid, p_recipient jsonb, p_order text, p_actor uuid, p_action text,
  p_plan text, p_period text, p_seats integer, p_expected_total integer
) returns integer language plpgsql security definer set search_path = '' as $$
declare amount integer;
begin
  if not exists (select 1 from cron.job where jobname = 'subscription-invoice-handoffs' and active)
    or not exists (select 1 from vault.secrets where name = 'abaco_project_url')
    or not exists (select 1 from vault.secrets where name = 'cron_secret') then
    raise exception 'El envío automático de facturas no está configurado. No se ha iniciado ningún cobro.' using errcode = '22023';
  end if;
  perform set_config('app.abaco_invoice_reservation', p_order, true);
  if p_action = 'renewal' and p_actor is null then
    amount := public.billing_reserve_renewal(p_tenant, p_order);
  elsif p_action in ('checkout', 'retry') and p_actor is not null then
    amount := public.billing_manage(p_tenant, p_actor, p_action, p_plan, p_period, p_seats, p_expected_total, p_order);
  else
    raise exception 'Acción de cobro no válida' using errcode = '22023';
  end if;
  if amount is not null and not exists (
    select 1 from public.billing_payments p join app_private.subscription_invoice_handoffs h on h.payment_id = p.id
    where p.merchant_order = p_order and p.tenant_id = p_tenant and h.recipient = p_recipient
      and p.vat_percent = 21 and p.net_cents > 0
      and p.amount_cents = app_private.billing_total(p.net_cents, 21)
  ) then
    raise exception 'Revisa los datos fiscales o el IVA antes de pagar' using errcode = '22023';
  end if;
  return amount;
end;
$$;
revoke all on function public.reserve_subscription_invoice_payment(uuid,jsonb,text,uuid,text,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.reserve_subscription_invoice_payment(uuid,jsonb,text,uuid,text,text,text,integer,integer)
  to service_role;

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
  if found then
    update public.billing_payments set invoice_status = 'pending' where id = new.id;
  end if;
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
  p_payment uuid, p_lease uuid, p_number text, p_url text, p_status text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update app_private.subscription_invoice_handoffs
     set lease_id = null, lease_until = null, last_error = case when p_status = 'sent' then null else p_status end,
         completed_at = case when p_status = 'sent' then now() else null end,
         next_attempt_at = now() + make_interval(mins => least(60, attempts * 5))
   where payment_id = p_payment and lease_id = p_lease;
  if not found then return false; end if;
  update public.billing_payments set invoice_status = p_status,
    invoice_number = p_number, invoice_portal_url = p_url where id = p_payment;
  return true;
end;
$$;

revoke all on function public.claim_subscription_invoice_handoff() from public, anon, authenticated;
revoke all on function public.finish_subscription_invoice_handoff(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_subscription_invoice_handoff() to service_role;
grant execute on function public.finish_subscription_invoice_handoff(uuid,uuid,text,text,text) to service_role;

create function public.superadmin_subscription_invoice_states(p_tenant uuid, p_payments uuid[])
returns table (id uuid, invoice_number text, invoice_status text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.invoice_number, p.invoice_status from public.billing_payments p
  where public.is_platform_superadmin() and p.tenant_id = p_tenant and p.id = any(p_payments);
$$;
revoke all on function public.superadmin_subscription_invoice_states(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.superadmin_subscription_invoice_states(uuid,uuid[]) to authenticated;

create function app_private.run_subscription_invoice_handoffs() returns void
language plpgsql security definer set search_path = '' as $$
declare project_url text; secret text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'abaco_project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if project_url is null or secret is null then return; end if;
  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/subscription-invoices',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb, timeout_milliseconds := 20000
  );
end;
$$;
revoke all on function app_private.run_subscription_invoice_handoffs() from public, anon, authenticated;
select cron.schedule('subscription-invoice-handoffs', '* * * * *', 'select app_private.run_subscription_invoice_handoffs()');

notify pgrst, 'reload schema';
