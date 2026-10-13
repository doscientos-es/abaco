-- Planes y suscripción. Cada empresa tiene su propio plan.
-- Todos los planes incluyen lo mismo; solo cambia el número de personas del equipo:
--   solo (1) · team (hasta 5) · business (hasta 15). Durante la prueba (14 días) el límite es 5.
-- Sin plan activo, la empresa pasa a solo lectura: nunca se pierden ni se ocultan datos.

alter table public.tenants
  add column plan text not null default 'trial' check (plan in ('trial', 'solo', 'team', 'business')),
  add column subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled')),
  add column trial_ends_at timestamptz not null default now() + interval '14 days',
  add column billing_interval text check (billing_interval in ('month', 'year')),
  add column current_period_end timestamptz,
  add column cancel_at_period_end boolean not null default false,
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text unique;

-- Máximo de personas por plan.
create function public.plan_member_limit(p_plan text) returns integer
language sql immutable set search_path = ''
as $$
  select case p_plan when 'solo' then 1 when 'business' then 15 else 5 end;
$$;

-- ¿Puede la empresa escribir datos? Prueba vigente, suscripción activa o pago pendiente (Stripe reintenta).
create function public.tenant_can_write(p_tenant uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select (subscription_status = 'trialing' and trial_ends_at > now())
        or subscription_status in ('active', 'past_due')
    from public.tenants where id = p_tenant
  ), false);
$$;

-- Solo el backend (webhook de Stripe, service role) puede tocar las columnas de facturación.
create function public.protect_tenant_billing() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated' and (
    new.plan is distinct from old.plan
    or new.subscription_status is distinct from old.subscription_status
    or new.trial_ends_at is distinct from old.trial_ends_at
    or new.billing_interval is distinct from old.billing_interval
    or new.current_period_end is distinct from old.current_period_end
    or new.cancel_at_period_end is distinct from old.cancel_at_period_end
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
  ) then
    raise exception 'El plan se gestiona desde Facturación';
  end if;
  return new;
end;
$$;

create trigger tenants_protect_billing before update on public.tenants
for each row execute function public.protect_tenant_billing();

-- Sin plan activo, los usuarios no pueden crear, editar ni borrar datos del negocio.
create function public.require_active_plan() returns trigger
language plpgsql set search_path = ''
as $$
declare
  target uuid := coalesce(new.tenant_id, old.tenant_id);
begin
  if current_user = 'authenticated' and not public.tenant_can_write(target) then
    raise exception 'Tu prueba ha terminado. Elige un plan para seguir editando.' using errcode = 'P0402';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'catalog_items', 'estimates', 'estimate_lines',
    'estimate_milestones', 'ledger_entries', 'invoices'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function public.require_active_plan()',
      t || '_require_plan', t);
  end loop;
end $$;

-- No se pueden añadir más personas que las del plan (también al invitar: lo hace el service role).
create function public.enforce_member_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  current_plan text;
  members integer;
begin
  select plan into current_plan from public.tenants where id = new.tenant_id;
  select count(*) into members from public.memberships where tenant_id = new.tenant_id;
  if members >= public.plan_member_limit(current_plan) then
    raise exception 'Tu plan no admite más personas en el equipo' using errcode = 'P0403';
  end if;
  return new;
end;
$$;

create trigger memberships_enforce_limit before insert on public.memberships
for each row execute function public.enforce_member_limit();

revoke all on function public.tenant_can_write(uuid) from public, anon;
grant execute on function public.tenant_can_write(uuid) to authenticated;
