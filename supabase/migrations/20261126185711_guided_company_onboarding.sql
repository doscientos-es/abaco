-- Existing companies have no onboarding record. Only self-service creation starts this flow.
create table app_private.company_onboarding (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  booking_reference uuid not null default gen_random_uuid() unique,
  booking_uid text unique,
  appointment_at timestamptz,
  booked_at timestamptz
);
alter table app_private.company_onboarding enable row level security;
revoke all on app_private.company_onboarding from public, anon, authenticated, service_role;

create or replace function public.create_company(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); new_tenant uuid; referral text; referrer uuid; first_company boolean;
begin
  if uid is null then raise exception 'Hace falta iniciar sesión'; end if;
  if char_length(trim(p_name)) not between 1 and 120 then
    raise exception 'El nombre de la empresa debe tener entre 1 y 120 caracteres';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('abaco-create-company:' || uid::text, 0));
  if (select count(*) from public.memberships where user_id = uid and role = 'admin') >= 10 then
    raise exception 'Has alcanzado el máximo de empresas';
  end if;
  first_company := not exists (select 1 from public.memberships where user_id = uid);
  if first_company then
    select upper(trim(raw_user_meta_data->>'abaco_referral_code')) into referral
      from auth.users where id = uid;
    select c.tenant_id into referrer from app_private.referral_codes c
      where c.code = referral
        and not exists (select 1 from public.memberships m where m.tenant_id = c.tenant_id and m.user_id = uid);
  end if;
  insert into public.tenants (name, trial_ends_at) values (trim(p_name), now()) returning id into new_tenant;
  insert into public.memberships (tenant_id, user_id, role) values (new_tenant, uid, 'admin');
  insert into app_private.company_onboarding(tenant_id, owner_id) values (new_tenant, uid);
  if referrer is not null then
    insert into app_private.referral_attributions (tenant_id, referrer_id) values (new_tenant, referrer);
  end if;
  return new_tenant;
end;
$$;

-- This gate is also used by operational mutation triggers and the existing edge/server APIs.
create or replace function public.tenant_can_write(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select t.is_complimentary or (
      ((t.subscription_status = 'trialing' and t.trial_ends_at > now())
        or t.subscription_status in ('active','past_due'))
      and not exists (
        select 1 from app_private.company_onboarding o
        where o.tenant_id = t.id and o.booked_at is null
      )
    )
    from public.tenants t where t.id = p_tenant
  ), false);
$$;

create function public.company_onboarding_status(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; uid uuid := (select auth.uid());
begin
  if not exists(select 1 from public.memberships m where m.tenant_id = p_tenant and m.user_id = uid) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'stage', case when o.booked_at is not null or t.is_complimentary then 'complete'
      when t.subscription_status = 'active' and t.current_period_end > now() and p.status = 'succeeded' then 'booking'
      when t.subscription_status in ('active','past_due') then 'billing_issue'
      when p.status = 'pending' then 'pending' else 'selection' end,
    'failed', coalesce(p.status = 'failed',false),
    'booking_reference', case when o.booked_at is null and not t.is_complimentary and t.subscription_status = 'active'
      and t.current_period_end > now() and p.status = 'succeeded' and o.owner_id = uid then o.booking_reference end,
    'appointment_at', o.appointment_at
  ) into result
  from app_private.company_onboarding o join public.tenants t on t.id = o.tenant_id
  left join lateral (
    select status from public.billing_payments
    where tenant_id = t.id and kind = 'first' order by created_at desc, id desc limit 1
  ) p on true
  where o.tenant_id = p_tenant;
  return result;
end;
$$;
revoke all on function public.company_onboarding_status(uuid) from public, anon;
grant execute on function public.company_onboarding_status(uuid) to authenticated;

-- IA applies to one named admin; renewals use the existing module billing and consumption limits.
insert into public.billing_module_catalog(code,status,monthly_cents,yearly_cents)
  values ('ai','pilot',375,4500) on conflict (code) do nothing;

create function app_private.has_paid_company_ai(p_tenant uuid, p_user uuid) returns boolean
language sql stable set search_path = '' as $$
  select app_private.tenant_module_enabled(p_tenant, 'ai') and p_user = coalesce(
    (select o.owner_id from app_private.company_onboarding o where o.tenant_id = p_tenant),
    (select m.user_id from public.memberships m where m.tenant_id = p_tenant
      and m.role::text in ('owner','admin') order by m.created_at, m.user_id limit 1));
$$;
revoke all on function app_private.has_paid_company_ai(uuid,uuid) from public, anon, authenticated;

create or replace function public.ai_my_access(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.tenant_can_write(p_tenant) and exists (
    select 1 from public.memberships m join public.tenants t on t.id = m.tenant_id
    where m.tenant_id = p_tenant and m.user_id = (select auth.uid())
      and m.role::text in ('owner','admin','editor')
      and (t.is_complimentary or app_private.has_paid_company_ai(m.tenant_id, m.user_id) or exists (
        select 1 from app_private.ai_assignments a where a.tenant_id = m.tenant_id
          and a.user_id = m.user_id and a.enabled and a.valid_until > now()))
  ), false);
$$;

create or replace function public.reserve_ai_request(p_tenant uuid, p_user uuid, p_task text) returns text
language plpgsql security definer set search_path = '' as $$
declare member_role text; courtesy boolean; reserved integer;
  current_month date := date_trunc('month', now() at time zone 'Europe/Madrid')::date;
begin
  if p_tenant is null or p_user is null or p_task is null or p_task not in ('estimate','receipt') then
    return 'forbidden';
  end if;
  select m.role::text, t.is_complimentary into member_role, courtesy
    from public.tenants t join public.memberships m on m.tenant_id = t.id
    where t.id = p_tenant and m.user_id = p_user for update of t, m;
  if member_role is null or not public.tenant_can_write(p_tenant)
    or (p_task = 'estimate' and member_role not in ('owner','admin','editor'))
    or (p_task = 'receipt' and member_role not in ('owner','admin')) then
    return 'forbidden';
  end if;
  if not courtesy and not coalesce(app_private.has_paid_company_ai(p_tenant, p_user),false) then
    perform 1 from app_private.ai_assignments a where a.tenant_id = p_tenant
      and a.user_id = p_user and a.enabled and a.valid_until > now() for update;
    if not found then return 'forbidden'; end if;
  end if;
  insert into app_private.ai_monthly_usage as usage (tenant_id, user_id, month, requests)
    values (p_tenant, p_user, current_month, 1)
    on conflict (tenant_id, user_id, month) do update set requests = usage.requests + 1
      where usage.requests < 500 returning requests into reserved;
  if reserved is not null then return 'allowed'; end if;
  update app_private.ai_credit_balances set credits = credits - 1
    where tenant_id = p_tenant and user_id = p_user and credits > 0 returning credits into reserved;
  return case when reserved is null then 'limit' else 'allowed' end;
end;
$$;

-- Replace the optional selection and reserve one immutable charge under the same tenant lock.
-- If pricing/permissions/preflight changed, the existing reservation RPC raises and rolls back all
-- module changes. No browser callback is ever allowed to settle a payment.
create function public.reserve_onboarding_payment(
  p_tenant uuid, p_recipient jsonb, p_order text, p_actor uuid,
  p_period text, p_seats integer, p_expected_total integer, p_modules text[]
) returns integer language plpgsql security definer set search_path = '' as $$
declare t public.tenants;
begin
  select * into strict t from public.tenants where id = p_tenant for update;
  if not exists(select 1 from app_private.company_onboarding o
      join public.memberships m on m.tenant_id = o.tenant_id and m.user_id = o.owner_id
      where o.tenant_id = p_tenant and o.owner_id = p_actor and o.booked_at is null
      and m.role = 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if t.subscription_status in ('active','past_due') or t.is_complimentary or t.next_plan is not null
    or t.billing_fixed_net_cents is not null or t.billing_vat_percent <> 21 then
    raise exception 'La empresa no admite este alta. Contacta con Ábaco.' using errcode = 'P0001';
  end if;
  if p_modules is null or cardinality(p_modules) > 3 or p_seats is null or p_seats not between 1 and 200
    or p_period is null or p_period not in ('month','year') or p_expected_total is null
    or exists(select 1 from unnest(p_modules) x(code)
       where x.code is null or x.code not in ('workers','procurement','ai')
         or not exists(select 1 from public.billing_module_catalog c where c.code = x.code and c.status = 'pilot')) then
    raise exception 'Selección no válida. Revisa los módulos y las plazas.' using errcode = '22023';
  end if;
  if exists(select 1 from public.billing_payments where tenant_id = p_tenant and status = 'pending') then
    raise exception 'Hay un pago pendiente de verificar. No repitas el pago.' using errcode = 'P0001';
  end if;
  update public.tenant_modules m set next_enabled = case when m.enabled then false else null end,
    updated_at = now(), updated_by = p_actor
    where m.tenant_id = p_tenant and not m.gifted;
  insert into public.tenant_modules(tenant_id,module_code,enabled,next_enabled,monthly_cents,yearly_cents,updated_by)
    select p_tenant,c.code,false,true,c.monthly_cents,c.yearly_cents,p_actor
    from public.billing_module_catalog c where c.code = any(p_modules) and c.status = 'pilot'
    on conflict(tenant_id,module_code) do update set next_enabled = true,
      monthly_cents = excluded.monthly_cents, yearly_cents = excluded.yearly_cents,
      updated_at = now(), updated_by = excluded.updated_by
    where not public.tenant_modules.gifted;
  return public.reserve_subscription_invoice_payment(
    p_tenant,p_recipient,p_order,p_actor,'checkout','standard',p_period,p_seats,p_expected_total);
end;
$$;
revoke all on function public.reserve_onboarding_payment(uuid,jsonb,text,uuid,text,integer,integer,text[]) from public, anon, authenticated;
grant execute on function public.reserve_onboarding_payment(uuid,jsonb,text,uuid,text,integer,integer,text[]) to service_role;

-- Only the signed scheduler callback can bind a paid company to a verified booking.
create function public.confirm_onboarding_booking(
  p_reference uuid, p_booking_uid text, p_appointment_at timestamptz, p_attendee_emails text[]
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_booking_uid is null or length(p_booking_uid) not between 1 and 160
    or p_appointment_at is null or p_appointment_at <= now()
    or p_appointment_at > now() + interval '180 days' then return false; end if;
  update app_private.company_onboarding o
  set booking_uid = p_booking_uid, appointment_at = p_appointment_at, booked_at = now()
  from public.tenants t, auth.users u
  where o.booking_reference = p_reference and o.booked_at is null and t.id = o.tenant_id
    and not t.is_complimentary and t.subscription_status = 'active' and t.current_period_end > now()
    and u.id = o.owner_id and lower(u.email) = any(p_attendee_emails)
    and exists(select 1 from public.memberships m where m.tenant_id = t.id and m.user_id = u.id and m.role = 'admin')
    and exists(select 1 from public.billing_payments p where p.tenant_id = t.id and p.kind = 'first' and p.status = 'succeeded');
  return found;
exception when unique_violation then return false;
end;
$$;
revoke all on function public.confirm_onboarding_booking(uuid,text,timestamptz,text[]) from public, anon, authenticated;
grant execute on function public.confirm_onboarding_booking(uuid,text,timestamptz,text[]) to service_role;
-- Deny direct access to core business data during a self-service activation. Legacy tenants
-- retain the same RLS policies and can still read their records if their subscription expires.
create function public.company_onboarding_allows_workspace(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (not exists(select 1 from app_private.company_onboarding
    where tenant_id = p_tenant and booked_at is null)
    or exists(select 1 from public.tenants where id = p_tenant and is_complimentary))
    and exists(select 1 from public.memberships
      where tenant_id = p_tenant and user_id = (select auth.uid()));
$$;
revoke all on function public.company_onboarding_allows_workspace(uuid) from public, anon;
grant execute on function public.company_onboarding_allows_workspace(uuid) to authenticated;

do $$
declare target text;
begin
  foreach target in array array[
    'clients', 'catalog_items', 'estimates', 'estimate_lines', 'estimate_milestones',
    'ledger_entries', 'invoices', 'work_orders', 'service_contracts', 'service_visits',
    'suppliers', 'inventory_items', 'staff_schedules', 'worker_personal_data'
  ] loop
    execute format('create policy onboarding_workspace on public.%I as restrictive for all
      to authenticated using (public.company_onboarding_allows_workspace(tenant_id))', target);
  end loop;
end $$;

create or replace function public.require_active_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated'
    and not public.tenant_can_write(coalesce(new.tenant_id, old.tenant_id)) then
    raise exception 'Completa la activación o revisa tu suscripción para seguir editando.' using errcode = 'P0402';
  end if;
  return coalesce(new, old);
end;
$$;
notify pgrst, 'reload schema';
