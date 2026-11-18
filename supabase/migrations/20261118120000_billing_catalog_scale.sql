-- A public, read-only price list. Quotes and every new bank operation use this catalogue.
create table public.billing_catalog (
  plan text not null check (plan in ('solo','team','business','scale')),
  seats integer not null check (seats between 1 and 200),
  monthly_cents integer not null check (monthly_cents between 1 and 1000000),
  yearly_cents integer generated always as (monthly_cents * 10) stored,
  vat_percent integer not null default 21 check (vat_percent = 21),
  primary key (plan, seats)
);
alter table public.billing_catalog enable row level security;
create policy billing_catalog_public on public.billing_catalog for select to anon, authenticated, service_role using (true);
revoke all on public.billing_catalog from anon, authenticated;
grant select on public.billing_catalog to anon, authenticated, service_role;
insert into public.billing_catalog (plan,seats,monthly_cents) values
  ('solo',1,2000), ('team',5,3400), ('business',15,5400),
  ('scale',25,6900), ('scale',50,11900), ('scale',75,15900),
  ('scale',100,19900), ('scale',150,26900), ('scale',200,32900);

alter table public.tenants drop constraint tenants_plan_check,
  add constraint tenants_plan_check check (plan in ('trial','solo','team','business','scale')),
  drop constraint tenants_next_plan_check,
  add constraint tenants_next_plan_check check (next_plan in ('solo','team','business','scale')),
  add column billing_seats integer check (billing_seats between 1 and 200),
  add column billing_net_cents integer check (billing_net_cents between 1 and 10000000),
  add column billing_module_net_cents integer not null default 0 check (billing_module_net_cents >= 0),
  add column next_billing_seats integer check (next_billing_seats between 1 and 200),
  add column next_billing_net_cents integer check (next_billing_net_cents between 1 and 10000000);
alter table public.billing_payments drop constraint billing_payments_plan_check,
  add constraint billing_payments_plan_check check (plan in ('solo','team','business','scale')),
  add column seats integer check (seats between 1 and 200),
  add column net_cents integer check (net_cents > 0),
  add column module_net_cents integer check (module_net_cents >= 0 and module_net_cents < net_cents);

-- Preserve exactly what the old checkout/renewal would have charged at migration time.
update public.tenants t set billing_seats = c.seats,
  billing_net_cents = public.plan_price_cents(t.plan, t.billing_interval)
from public.billing_catalog c where t.plan = c.plan and t.billing_interval is not null;
update public.tenants t set next_billing_seats = c.seats,
  next_billing_net_cents = public.plan_price_cents(t.next_plan, t.next_interval)
from public.billing_catalog c where t.next_plan = c.plan and t.next_interval is not null;

create function app_private.protect_billing_terms() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and (
       (tg_op = 'INSERT' and (new.plan <> 'trial' or new.subscription_status <> 'trialing'
         or new.billing_interval is not null or new.current_period_end is not null
         or new.next_plan is not null or new.next_interval is not null
         or new.billing_module_net_cents <> 0
         or num_nonnulls(new.billing_seats,new.billing_net_cents,new.next_billing_seats,new.next_billing_net_cents) > 0))
       or (tg_op = 'UPDATE' and row(new.billing_seats,new.billing_net_cents,new.next_billing_seats,new.next_billing_net_cents)
         is distinct from row(old.billing_seats,old.billing_net_cents,old.next_billing_seats,old.next_billing_net_cents)
         or (tg_op = 'UPDATE' and new.billing_module_net_cents is distinct from old.billing_module_net_cents))
     ) then raise exception 'El plan se gestiona desde Facturación' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger tenants_protect_billing_terms before insert or update on public.tenants
for each row execute function app_private.protect_billing_terms();

create function app_private.billing_total(p_net integer) returns integer
language sql immutable strict set search_path = '' as $$ select ((p_net::bigint * 121 + 50) / 100)::integer $$;

-- Standard catalogue quotes, with a frozen price for an existing or negotiated agreement.
create function app_private.billing_terms(t public.tenants, p_next boolean)
returns table (plan text, period text, seats integer, net_cents integer, amount_cents integer)
language sql stable set search_path = '' as $$
  select coalesce(case when p_next then t.next_plan end, t.plan),
    coalesce(case when p_next then t.next_interval end, t.billing_interval), s.seats, s.net,
    app_private.billing_total(s.net)
  from lateral (
    select case when p_next and t.next_plan is not null
      then coalesce(t.next_billing_seats, public.plan_member_limit(t.next_plan))
      else coalesce(t.billing_seats, public.plan_member_limit(t.plan)) end as seats,
    case when p_next and t.next_plan is not null
      then coalesce(t.next_billing_net_cents, public.plan_price_cents(t.next_plan,t.next_interval))
      else coalesce(t.billing_net_cents, public.plan_price_cents(t.plan,t.billing_interval)) end as net
  ) s;
$$;

-- The subscription modules migration supplies these hooks; the base catalogue is independently deployable.
create function app_private.billing_module_net(p_tenant uuid, p_period text) returns integer
language sql stable set search_path = '' as $$ select 0 $$;

create function app_private.apply_paid_modules(p_tenant uuid) returns void
language plpgsql set search_path = '' as $$ begin return; end; $$;

create function app_private.billing_charge_preview(t public.tenants, p_next boolean) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(q) || jsonb_build_object('base_net_cents', q.net_cents,
    'module_net_cents', a.net, 'net_cents', q.net_cents + a.net,
    'amount_cents', app_private.billing_total(q.net_cents + a.net))
  from app_private.billing_terms(t,p_next) q
  cross join lateral (select case when p_next then app_private.billing_module_net(t.id,q.period)
    else t.billing_module_net_cents end as net) a
  where q.net_cents is not null
$$;

-- The tenant lock serializes team additions, plan changes and bank operation reservation.
create or replace function public.enforce_member_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.tenants; cap integer; pending_cap integer;
begin
  select * into strict t from public.tenants where id = new.tenant_id for update;
  select seats into cap from app_private.billing_terms(t, false);
  if t.next_plan is not null and t.subscription_status in ('active','past_due') then
    cap := least(cap, coalesce(t.next_billing_seats, public.plan_member_limit(t.next_plan)));
  end if;
  select min(p.seats) into pending_cap from public.billing_payments p
    where p.tenant_id = t.id and p.status = 'pending' and p.kind = 'first';
  if (select count(*) from public.memberships where tenant_id = t.id) >= least(cap, pending_cap) then
    raise exception 'Tu plan actual o pendiente no admite más personas en el equipo' using errcode = 'P0403';
  end if;
  return new;
end;
$$;
create trigger memberships_enforce_limit_on_move before update of tenant_id on public.memberships
for each row when (new.tenant_id is distinct from old.tenant_id) execute function public.enforce_member_limit();

create function app_private.billing_require_capacity(p_tenant uuid, p_seats integer) returns void
language plpgsql set search_path = '' as $$
begin
  if p_seats is null or (select count(*) from public.memberships where tenant_id = p_tenant) > p_seats then
    raise exception 'El plan no cubre el número de personas con acceso' using errcode = 'P0403';
  end if;
end;
$$;

create function public.billing_preview(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.tenants;
begin
  if not public.is_platform_superadmin() and not exists(select 1 from public.memberships
    where tenant_id = p_tenant and user_id = (select auth.uid()) and role = 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into strict t from public.tenants where id = p_tenant;
  return jsonb_build_object(
    'current', app_private.billing_charge_preview(t,false),
    'next', app_private.billing_charge_preview(t,true),
    'module_monthly_cents', app_private.billing_module_net(t.id,'month'),
    'module_yearly_cents', app_private.billing_module_net(t.id,'year'),
    'cancel_at_period_end', t.cancel_at_period_end,
    'pending', exists(select 1 from public.billing_payments where tenant_id = t.id and status = 'pending'));
end;
$$;
revoke all on function public.billing_preview(uuid) from public, anon;
grant execute on function public.billing_preview(uuid) to authenticated;

create function public.billing_manage(
  p_tenant uuid, p_actor uuid, p_action text, p_plan text, p_period text,
  p_seats integer, p_expected_total integer, p_order text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare t public.tenants; q record; net integer; modules integer; total integer;
begin
  select * into strict t from public.tenants where id = p_tenant for update;
  if not exists(select 1 from public.memberships where tenant_id = t.id and user_id = p_actor and role = 'admin') then
    raise exception 'Solo un administrador puede gestionar el plan' using errcode = '42501';
  end if;
  if t.is_complimentary then raise exception 'Esta empresa tiene acceso de cortesía' using errcode = 'P0001'; end if;
  if exists(select 1 from public.billing_payments where tenant_id = t.id and status = 'pending') then
    raise exception 'Hay un pago pendiente de verificar. No repitas el pago; contacta con soporte si sigue pendiente.' using errcode = 'P0001';
  end if;
  if p_action in ('cancel','resume','undo') then
    if t.subscription_status <> 'active' then raise exception 'No hay suscripción activa' using errcode = 'P0001'; end if;
    if p_action = 'undo' then
      update public.tenants set next_plan = null, next_interval = null, next_billing_seats = null,
        next_billing_net_cents = null where id = t.id;
    else
      update public.tenants set cancel_at_period_end = (p_action = 'cancel') where id = t.id;
    end if;
    return 0;
  end if;
  if p_action = 'retry' then
    if t.subscription_status <> 'past_due' then raise exception 'No hay cuotas pendientes' using errcode = 'P0001'; end if;
    select * into q from app_private.billing_terms(t,true);
  else
    if p_action is null or p_action not in ('checkout','change') or p_period is null or p_period not in ('month','year') then
      raise exception 'Acción o periodo no válido' using errcode = '22023';
    end if;
    if (p_action = 'change' and (t.subscription_status <> 'active' or t.cancel_at_period_end))
       or (p_action = 'checkout' and t.subscription_status in ('active','past_due')) then
      raise exception 'El estado de la suscripción ha cambiado. Revisa el plan.' using errcode = 'P0001';
    end if;
    select * into q from app_private.billing_terms(t,true);
    if t.next_plan is null or row(q.plan,q.period,q.seats) is distinct from row(p_plan,p_period,p_seats) then
      select case p_period when 'month' then monthly_cents else yearly_cents end into net
      from public.billing_catalog where plan = p_plan and seats = p_seats;
      select p_plan as plan, p_period as period, p_seats as seats, net as net_cents,
        app_private.billing_total(net) as amount_cents into q;
    end if;
  end if;
  modules := app_private.billing_module_net(t.id,q.period);
  total := app_private.billing_total(q.net_cents + modules);
  if total is null or total is distinct from p_expected_total then
    raise exception 'El importe ha cambiado. Actualiza la página y confirma de nuevo.' using errcode = 'P0001';
  end if;
  perform app_private.billing_require_capacity(t.id,q.seats);
  if p_action = 'change' then
    if t.next_plan is not null then
      raise exception 'Retira primero el cambio que ya tienes programado' using errcode = 'P0001';
    end if;
    update public.tenants set next_plan = q.plan, next_interval = q.period,
      next_billing_seats = q.seats, next_billing_net_cents = q.net_cents where id = t.id;
  else
    if t.next_plan is not null and row(q.plan,q.period,q.seats) is distinct from
       row(t.next_plan,t.next_interval,t.next_billing_seats) then
      raise exception 'Tienes una oferta acordada. Contacta con Ábaco para cambiarla.' using errcode = 'P0001';
    end if;
    insert into public.billing_payments (tenant_id,merchant_order,kind,plan,period,seats,net_cents,module_net_cents,amount_cents)
      values(t.id,p_order,case when p_action = 'retry' then 'renewal' else 'first' end,
        q.plan,q.period,q.seats,q.net_cents + modules,modules,total);
  end if;
  return total;
end;
$$;
revoke all on function public.billing_manage(uuid,uuid,text,text,text,integer,integer,text) from public, anon, authenticated;
grant execute on function public.billing_manage(uuid,uuid,text,text,text,integer,integer,text) to service_role;

create function public.billing_reserve_renewal(p_tenant uuid, p_order text) returns integer
language plpgsql security definer set search_path = '' as $$
declare t public.tenants; q record; modules integer; total integer;
begin
  select * into strict t from public.tenants where id = p_tenant for update;
  if t.is_complimentary or t.subscription_status not in ('active','past_due') or t.cancel_at_period_end
    or t.current_period_end is null or t.current_period_end > now()
    or not exists(select 1 from public.billing_methods where tenant_id = t.id)
    or exists(select 1 from public.billing_payments where tenant_id = t.id
      and (status = 'pending' or created_at > now() - interval '20 hours')) then return null; end if;
  select * into q from app_private.billing_terms(t,true);
  perform app_private.billing_require_capacity(t.id,q.seats);
  modules := app_private.billing_module_net(t.id,q.period);
  total := app_private.billing_total(q.net_cents + modules);
  if total is null then return null; end if;
  insert into public.billing_payments (tenant_id,merchant_order,kind,plan,period,seats,net_cents,module_net_cents,amount_cents)
    values(t.id,p_order,'renewal',q.plan,q.period,q.seats,q.net_cents + modules,modules,total);
  return total;
end;
$$;
revoke all on function public.billing_reserve_renewal(uuid,text) from public, anon, authenticated;
grant execute on function public.billing_reserve_renewal(uuid,text) to service_role;

-- Keep the webhook signature and existing settlement rules, including duplicate notices.
alter function public.apply_billing_payment(text,boolean,text,text) rename to billing_apply_legacy;
revoke all on function public.billing_apply_legacy(text,boolean,text,text) from service_role;
create function public.apply_billing_payment(p_order text, p_succeeded boolean, p_code text, p_reference text)
returns text language plpgsql security definer set search_path = '' as $$
declare pay public.billing_payments; result text;
begin
  select * into pay from public.billing_payments where merchant_order = p_order;
  if not found then return 'unknown_order'; end if;
  perform 1 from public.tenants where id = pay.tenant_id for update;
  result := public.billing_apply_legacy(p_order,p_succeeded,p_code,p_reference);
  if result = 'succeeded' then
    update public.tenants set billing_seats = coalesce(pay.seats,public.plan_member_limit(pay.plan)),
      billing_net_cents = coalesce(pay.net_cents,round(pay.amount_cents / 1.21)::integer) - coalesce(pay.module_net_cents,0),
      billing_module_net_cents = coalesce(pay.module_net_cents,0),
      next_billing_seats = null, next_billing_net_cents = null where id = pay.tenant_id;
    if pay.module_net_cents is not null then perform app_private.apply_paid_modules(pay.tenant_id); end if;
  end if;
  return result;
end;
$$;
revoke all on function public.apply_billing_payment(text,boolean,text,text) from public, anon, authenticated;
grant execute on function public.apply_billing_payment(text,boolean,text,text) to service_role;

-- Leave uncertain payments pending until confirmed by Redsys or reconciled by support.
create or replace function public.billing_due_renewals()
returns table (tenant_id uuid, plan text, period text, redsys_reference text)
language sql stable security definer set search_path = '' as $$
  select t.id, coalesce(t.next_plan,t.plan), coalesce(t.next_interval,t.billing_interval), m.redsys_reference
  from public.tenants t join public.billing_methods m on m.tenant_id = t.id
  where not t.is_complimentary and not t.cancel_at_period_end
    and t.subscription_status in ('active','past_due') and t.plan <> 'trial'
    and t.billing_interval is not null and t.current_period_end <= now()
    and not exists(select 1 from public.billing_payments p where p.tenant_id = t.id
      and (p.status = 'pending' or p.created_at > now() - interval '20 hours'));
$$;

create table public.billing_agreement_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid not null,
  changed_at timestamptz not null default now(),
  previous_terms jsonb,
  scheduled_terms jsonb not null
);
alter table public.billing_agreement_log enable row level security;
revoke all on public.billing_agreement_log from anon, authenticated;

-- A quote can use a catalogue price (null override) or an agreed net amount. It never charges here.
create function public.superadmin_schedule_billing(p_tenant uuid,p_plan text,p_period text,p_seats integer,p_net integer)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tenants; previous jsonb; net integer;
begin
  if not public.is_platform_superadmin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  select * into strict t from public.tenants where id = p_tenant for update;
  if t.is_complimentary or t.cancel_at_period_end or t.subscription_status = 'past_due' or exists(
    select 1 from public.billing_payments where tenant_id = t.id and status = 'pending'
  ) then raise exception 'Resuelve primero la cancelación o el pago en curso'; end if;
  if p_period is null or p_period not in ('month','year') then raise exception 'Periodo no válido'; end if;
  select case p_period when 'month' then monthly_cents else yearly_cents end into strict net
    from public.billing_catalog where plan = p_plan and seats = p_seats;
  net := coalesce(p_net,net);
  if net < 1 or net > 10000000 then raise exception 'Importe fuera de rango'; end if;
  perform app_private.billing_require_capacity(t.id,p_seats);
  select to_jsonb(q) into previous from app_private.billing_terms(t,true) q where q.net_cents is not null;
  update public.tenants set next_plan = p_plan, next_interval = p_period, next_billing_seats = p_seats,
    next_billing_net_cents = net where id = t.id returning * into t;
  insert into public.billing_agreement_log(tenant_id,actor_id,previous_terms,scheduled_terms)
    select t.id,(select auth.uid()),previous,to_jsonb(q) from app_private.billing_terms(t,true) q;
end;
$$;
revoke all on function public.superadmin_schedule_billing(uuid,text,text,integer,integer) from public, anon;
grant execute on function public.superadmin_schedule_billing(uuid,text,text,integer,integer) to authenticated;
