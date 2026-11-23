-- Preserve the exact start of each paid cycle; subtracting a calendar month
-- from the end is not reversible for subscriptions started at month end.
create table app_private.billing_paid_cycles (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (starts_at < ends_at)
);
alter table app_private.billing_paid_cycles enable row level security;
revoke all on app_private.billing_paid_cycles from public, anon, authenticated;

-- Only backfill cycles for which the original invoice captured exact dates.
insert into app_private.billing_paid_cycles (tenant_id, starts_at, ends_at)
select distinct on (t.id) t.id, (h.payload->>'startsAt')::timestamptz, t.current_period_end
from public.tenants t
join public.billing_payments p on p.tenant_id = t.id and p.status = 'succeeded'
join app_private.subscription_invoice_handoffs h on h.payment_id = p.id
where t.current_period_end is not null and h.payload is not null
  and (h.payload->>'endsAt')::timestamptz = t.current_period_end
  and (h.payload->>'startsAt')::timestamptz < t.current_period_end
order by t.id, p.settled_at desc, p.id desc;

-- The existing settlement updates the payment before advancing the tenant.
-- Both updates are part of the same transaction and use its stable now().
create function app_private.record_paid_billing_cycle() returns trigger
language plpgsql security definer set search_path = '' as $$
declare starts_at timestamptz;
begin
  if new.kind not in ('first', 'renewal') then return new; end if;
  select case when new.kind = 'renewal' then coalesce(t.current_period_end, now()) else now() end
    into strict starts_at from public.tenants t where t.id = new.tenant_id;
  insert into app_private.billing_paid_cycles (tenant_id, starts_at, ends_at)
    values (new.tenant_id, starts_at,
      starts_at + case new.period when 'year' then interval '1 year' else interval '1 month' end)
    on conflict (tenant_id) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at;
  return new;
end;
$$;
revoke all on function app_private.record_paid_billing_cycle() from public, anon, authenticated;
create trigger record_paid_billing_cycle after update of status on public.billing_payments
  for each row when (old.status = 'pending' and new.status = 'succeeded')
  execute function app_private.record_paid_billing_cycle();