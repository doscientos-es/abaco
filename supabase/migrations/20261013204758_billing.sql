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
  add column past_due_since timestamptz,
  -- Cambio de plan pedido: se aplica en la próxima renovación.
  add column next_plan text check (next_plan in ('solo', 'team', 'business')),
  add column next_interval text check (next_interval in ('month', 'year'));

-- Cobro con Redsys. La tarjeta no se guarda: Redsys da una referencia y solo el backend
-- (service role) puede leerla. Sin políticas RLS, nadie desde el navegador accede.
create table public.billing_methods (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  redsys_reference text not null,
  updated_at timestamptz not null default now()
);
alter table public.billing_methods enable row level security;

-- Cada intento de cobro. `merchant_order` es el número de operación que Redsys devuelve.
create table public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  merchant_order text not null unique check (merchant_order ~ '^[0-9]{4}[A-Za-z0-9]{4,8}$'),
  kind text not null check (kind in ('first', 'renewal')),
  plan text not null check (plan in ('solo', 'team', 'business')),
  period text not null check (period in ('month', 'year')),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  response_code text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
alter table public.billing_payments enable row level security;
create index billing_payments_tenant_idx on public.billing_payments (tenant_id, created_at desc);

-- Precio en céntimos sin IVA. Los mismos números están en la app (features/billing/domain/plans.ts).
create function public.plan_price_cents(p_plan text, p_interval text) returns integer
language sql immutable set search_path = ''
as $$
  select case p_interval
    when 'month' then case p_plan when 'solo' then 1500 when 'team' then 2900 when 'business' then 4900 end
    when 'year' then case p_plan when 'solo' then 15000 when 'team' then 29000 when 'business' then 49000 end
  end;
$$;

-- Importe que se cobra: precio + 21 % de IVA.
create function public.plan_charge_cents(p_plan text, p_interval text) returns integer
language sql immutable set search_path = ''
as $$
  select ((public.plan_price_cents(p_plan, p_interval) * 121) + 50) / 100;
$$;

-- Máximo de personas por plan.
create function public.plan_member_limit(p_plan text) returns integer
language sql immutable set search_path = ''
as $$
  select case p_plan when 'solo' then 1 when 'business' then 15 else 5 end;
$$;

-- ¿Puede la empresa escribir datos? Prueba vigente, suscripción activa o pago pendiente (se reintenta 7 días).
create function public.tenant_can_write(p_tenant uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select (subscription_status = 'trialing' and trial_ends_at > now())
        or subscription_status in ('active', 'past_due')
    from public.tenants where id = p_tenant
  ), false);
$$;

-- Solo el backend (funciones de cobro, service role) puede tocar las columnas de facturación.
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
    or new.past_due_since is distinct from old.past_due_since
    or new.next_plan is distinct from old.next_plan
    or new.next_interval is distinct from old.next_interval
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

-- Aplica el resultado de un cobro de Redsys. Solo el service role puede llamarla.
create function public.apply_billing_payment(p_order text, p_succeeded boolean, p_code text, p_reference text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  pay public.billing_payments;
  base timestamptz;
begin
  select * into pay from public.billing_payments where merchant_order = p_order for update;
  if not found then return 'unknown_order'; end if;
  if pay.status <> 'pending' then return 'duplicate'; end if;

  update public.billing_payments
    set status = case when p_succeeded then 'succeeded' else 'failed' end,
        response_code = p_code, settled_at = now()
    where id = pay.id;

  if p_succeeded then
    if p_reference is not null then
      insert into public.billing_methods (tenant_id, redsys_reference)
      values (pay.tenant_id, p_reference)
      on conflict (tenant_id) do update set redsys_reference = excluded.redsys_reference, updated_at = now();
    end if;
    -- Una renovación suma desde el final del periodo; un primer pago, desde hoy.
    select case when pay.kind = 'renewal' then coalesce(current_period_end, now()) else now() end
      into base from public.tenants where id = pay.tenant_id;
    update public.tenants set
      plan = pay.plan,
      billing_interval = pay.period,
      subscription_status = 'active',
      current_period_end = base + case pay.period when 'year' then interval '1 year' else interval '1 month' end,
      cancel_at_period_end = false,
      past_due_since = null,
      next_plan = null,
      next_interval = null
    where id = pay.tenant_id;
    return 'succeeded';
  end if;

  if pay.kind = 'renewal' then
    update public.tenants set
      subscription_status = 'past_due',
      past_due_since = coalesce(past_due_since, now())
    where id = pay.tenant_id;
  end if;
  return 'failed';
end;
$$;

-- Cierra las suscripciones que ya no deben seguir: canceladas al final del periodo
-- o con el pago sin resolver durante 7 días.
create function public.expire_subscriptions() returns integer
language sql security definer set search_path = ''
as $$
  with closed as (
    update public.tenants set subscription_status = 'canceled', past_due_since = null
    where (subscription_status = 'active' and cancel_at_period_end and current_period_end <= now())
       or (subscription_status = 'past_due' and past_due_since <= now() - interval '7 days')
    returning 1
  )
  select count(*)::integer from closed;
$$;

-- Empresas a las que toca cobrar hoy: periodo terminado y tarjeta guardada. No repite
-- si ya hubo un intento en las últimas 20 horas (evita doble cobro y limita los reintentos).
create function public.billing_due_renewals()
returns table (tenant_id uuid, plan text, period text, redsys_reference text)
language sql stable security definer set search_path = ''
as $$
  select t.id, coalesce(t.next_plan, t.plan), coalesce(t.next_interval, t.billing_interval), m.redsys_reference
  from public.tenants t
  join public.billing_methods m on m.tenant_id = t.id
  where t.subscription_status in ('active', 'past_due')
    and not t.cancel_at_period_end
    and t.plan <> 'trial'
    and t.billing_interval is not null
    and t.current_period_end <= now()
    and not exists (
      select 1 from public.billing_payments p
      where p.tenant_id = t.id and p.created_at > now() - interval '20 hours'
    );
$$;

revoke all on function public.apply_billing_payment(text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.expire_subscriptions() from public, anon, authenticated;
revoke all on function public.billing_due_renewals() from public, anon, authenticated;
grant execute on function public.apply_billing_payment(text, boolean, text, text) to service_role;
grant execute on function public.expire_subscriptions() to service_role;
grant execute on function public.billing_due_renewals() to service_role;
