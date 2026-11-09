-- Courtesy access is separate from payment status and cannot be self-assigned.
alter table public.tenants add column is_complimentary boolean not null default false;

create function public.protect_complimentary_access() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and
     ((tg_op = 'INSERT' and new.is_complimentary) or
      (tg_op = 'UPDATE' and new.is_complimentary is distinct from old.is_complimentary)) then
    raise exception 'El acceso de cortesía solo lo gestiona Ábaco';
  end if;
  return new;
end;
$$;

create trigger tenants_protect_complimentary before insert or update on public.tenants
for each row execute function public.protect_complimentary_access();

-- A pending bank operation must be reconciled before enabling courtesy. The tenant
-- row is locked by the update, serializing this check with new payment attempts.
create function public.check_complimentary_pending_payments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_complimentary and (tg_op = 'INSERT' or not old.is_complimentary)
     and exists (select 1 from public.billing_payments
                 where tenant_id = new.id and status = 'pending') then
    raise exception 'Hay pagos pendientes de verificar';
  end if;
  return new;
end;
$$;

create trigger tenants_check_complimentary before insert or update on public.tenants
for each row execute function public.check_complimentary_pending_payments();

create function public.prevent_complimentary_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare courtesy boolean;
begin
  select is_complimentary into courtesy from public.tenants where id = new.tenant_id for update;
  if courtesy then raise exception 'La empresa tiene acceso de cortesía'; end if;
  return new;
end;
$$;

create trigger billing_payments_prevent_complimentary before insert on public.billing_payments
for each row execute function public.prevent_complimentary_payment();

create or replace function public.tenant_can_write(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_complimentary
    or (subscription_status = 'trialing' and trial_ends_at > now())
    or subscription_status in ('active', 'past_due')
    from public.tenants where id = p_tenant), false);
$$;

create or replace function public.billing_due_renewals()
returns table (tenant_id uuid, plan text, period text, redsys_reference text)
language sql stable security definer set search_path = '' as $$
  select t.id, coalesce(t.next_plan, t.plan), coalesce(t.next_interval, t.billing_interval), m.redsys_reference
  from public.tenants t
  join public.billing_methods m on m.tenant_id = t.id
  where not t.is_complimentary
    and t.subscription_status in ('active', 'past_due')
    and not t.cancel_at_period_end
    and t.plan <> 'trial'
    and t.billing_interval is not null
    and t.current_period_end <= now()
    and not exists (select 1 from public.billing_payments p
                    where p.tenant_id = t.id and p.created_at > now() - interval '20 hours');
$$;

create or replace function public.expire_subscriptions() returns integer
language sql security definer set search_path = '' as $$
  with closed as (
    update public.tenants set subscription_status = 'canceled', past_due_since = null
    where not is_complimentary and (
      (subscription_status = 'active' and cancel_at_period_end and current_period_end <= now())
      or (subscription_status = 'past_due' and past_due_since <= now() - interval '7 days'))
    returning 1
  ) select count(*)::integer from closed;
$$;

revoke all on function public.protect_complimentary_access() from public, anon, authenticated;
revoke all on function public.check_complimentary_pending_payments() from public, anon, authenticated;
revoke all on function public.prevent_complimentary_payment() from public, anon, authenticated;