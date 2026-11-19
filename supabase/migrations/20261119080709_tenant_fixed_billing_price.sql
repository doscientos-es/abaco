alter table public.tenants
  add column billing_fixed_net_cents integer check (billing_fixed_net_cents between 1 and 10000000),
  add column next_billing_managed boolean not null default false,
  add constraint tenants_managed_billing_requires_plan check (not next_billing_managed or next_plan is not null);

-- Existing price snapshots still renew as before. A fixed agreement requires an explicit override.

create or replace function app_private.protect_billing_terms() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and (
       (tg_op = 'INSERT' and (new.plan <> 'trial' or new.subscription_status <> 'trialing'
         or new.billing_interval is not null or new.current_period_end is not null
         or new.next_plan is not null or new.next_interval is not null or new.next_billing_managed
         or new.billing_module_net_cents <> 0
         or new.billing_vat_percent <> 21 or new.billing_paid_vat_percent <> 21
         or num_nonnulls(new.billing_seats,new.billing_net_cents,new.next_billing_seats,
           new.next_billing_net_cents,new.billing_fixed_net_cents) > 0))
       or (tg_op = 'UPDATE' and row(new.billing_seats,new.billing_net_cents,new.next_billing_seats,
         new.next_billing_net_cents,new.billing_fixed_net_cents,new.next_billing_managed)
         is distinct from row(old.billing_seats,old.billing_net_cents,old.next_billing_seats,
           old.next_billing_net_cents,old.billing_fixed_net_cents,old.next_billing_managed))
       or (tg_op = 'UPDATE' and row(new.billing_module_net_cents,new.billing_vat_percent,new.billing_paid_vat_percent)
         is distinct from row(old.billing_module_net_cents,old.billing_vat_percent,old.billing_paid_vat_percent))
     ) then raise exception 'El plan se gestiona desde Facturación' using errcode = '42501'; end if;
  -- Settlement clears next_plan. Keep the fixed price, but no longer mark a scheduled change.
  if new.next_plan is null then new.next_billing_managed := false; end if;
  return new;
end;
$$;

create or replace function app_private.billing_terms(t public.tenants, p_next boolean)
returns table (plan text, period text, seats integer, net_cents integer, vat_percent integer)
language sql stable set search_path = '' as $$
  select coalesce(case when p_next then t.next_plan end, t.plan),
    coalesce(case when p_next then t.next_interval end, t.billing_interval),
    case when p_next and t.next_plan is not null
      then coalesce(t.next_billing_seats, public.plan_member_limit(t.next_plan))
      else coalesce(t.billing_seats, public.plan_member_limit(t.plan)) end,
    case when p_next and t.billing_fixed_net_cents is not null then t.billing_fixed_net_cents
      when p_next and t.next_plan is not null
      then coalesce(t.next_billing_net_cents, public.plan_price_cents(t.next_plan,t.next_interval))
      else coalesce(t.billing_net_cents, public.plan_price_cents(t.plan,t.billing_interval)) end,
    case when p_next then t.billing_vat_percent else t.billing_paid_vat_percent end;
$$;

create or replace function public.billing_preview(p_tenant uuid) returns jsonb
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
    'fixed_net_cents', t.billing_fixed_net_cents,
    'next_managed', t.next_billing_managed,
    'module_monthly_cents', app_private.billing_module_net(t.id,'month'),
    'module_yearly_cents', app_private.billing_module_net(t.id,'year'),
    'vat_percent', t.billing_vat_percent,
    'cancel_at_period_end', t.cancel_at_period_end,
    'pending', exists(select 1 from public.billing_payments where tenant_id = t.id and status = 'pending'));
end;
$$;

create or replace function public.billing_manage(
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
      if t.next_billing_managed then
        raise exception 'Contacta con Ábaco para modificar las condiciones programadas' using errcode = 'P0001';
      end if;
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
    -- Older pages confirm the original fixed price. Never accept a different amount on their behalf.
    if p_seats is null and p_expected_total is null and p_plan in ('solo','team','business') then
      p_seats := public.plan_member_limit(p_plan);
      p_expected_total := public.plan_charge_cents(p_plan,p_period);
    end if;
    select * into q from app_private.billing_terms(t,true);
    if t.billing_fixed_net_cents is not null and p_period is distinct from q.period then
      raise exception 'Contacta con Ábaco para cambiar el periodo de una tarifa pactada' using errcode = 'P0001';
    end if;
    if t.next_plan is null or row(q.plan,q.period,q.seats) is distinct from row(p_plan,p_period,p_seats) then
      select coalesce(t.billing_fixed_net_cents,case p_period when 'month' then monthly_cents else yearly_cents end)
      into net from public.billing_catalog where plan = p_plan and seats = p_seats;
      select p_plan as plan, p_period as period, p_seats as seats, net as net_cents,
        t.billing_vat_percent as vat_percent into q;
    end if;
  end if;
  modules := app_private.billing_module_net(t.id,q.period);
  total := app_private.billing_total(q.net_cents + modules,q.vat_percent);
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
    insert into public.billing_payments (tenant_id,merchant_order,kind,plan,period,seats,net_cents,module_net_cents,vat_percent,amount_cents)
      values(t.id,p_order,case when p_action = 'retry' then 'renewal' else 'first' end,
        q.plan,q.period,q.seats,q.net_cents + modules,modules,q.vat_percent,total);
  end if;
  return total;
end;
$$;

create or replace function public.superadmin_schedule_billing(p_tenant uuid,p_plan text,p_period text,p_seats integer,p_net integer)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tenants; previous jsonb; net integer; price_source text;
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
  previous := app_private.billing_charge_preview(t,true) || jsonb_build_object('fixed_net_cents',t.billing_fixed_net_cents);
  update public.tenants set next_plan = p_plan, next_interval = p_period, next_billing_seats = p_seats,
    next_billing_net_cents = net, billing_fixed_net_cents = p_net, next_billing_managed = true
    where id = t.id returning * into t;
  price_source := case when p_net is null then 'catalog' else 'fixed' end;
  insert into public.billing_agreement_log(tenant_id,actor_id,previous_terms,scheduled_terms)
    values (t.id,(select auth.uid()),previous,
      app_private.billing_charge_preview(t,true) || jsonb_build_object('price_source',price_source));
end;
$$;

create function public.superadmin_restore_billing_catalog(p_tenant uuid, p_expected_net integer) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tenants; q record; catalog_net integer;
begin
  if not public.is_platform_superadmin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  select * into strict t from public.tenants where id = p_tenant for update;
  select * into q from app_private.billing_terms(t,true);
  select case q.period when 'month' then c.monthly_cents when 'year' then c.yearly_cents end
    into catalog_net from public.billing_catalog c where c.plan = q.plan and c.seats = q.seats for share;
  if catalog_net is null or catalog_net is distinct from p_expected_net then
    raise exception 'La tarifa de catálogo ha cambiado. Actualiza y confirma de nuevo';
  end if;
  perform public.superadmin_schedule_billing(t.id,q.plan,q.period,q.seats,null);
end;
$$;
revoke all on function public.superadmin_restore_billing_catalog(uuid,integer) from public, anon;
grant execute on function public.superadmin_restore_billing_catalog(uuid,integer) to authenticated;
