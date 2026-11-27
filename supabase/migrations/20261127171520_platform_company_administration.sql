-- Archiving hides a directory entry only. It does not delete a tenant, end access,
-- alter the subscription, or remove any invoice or payment.
create table app_private.platform_archived_companies (
  tenant_id uuid primary key,
  archived_at timestamptz not null default now(),
  restored_at timestamptz
);
-- The tenant is validated under lock before recording an action. Retain audit
-- history even if the tenant is removed by a different workflow.
create table app_private.platform_company_actions (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  actor_id uuid not null,
  action text not null check (action in ('pause','resume','archive','restore')),
  performed_at timestamptz not null default now()
);
alter table app_private.platform_archived_companies enable row level security;
alter table app_private.platform_company_actions enable row level security;
revoke all on app_private.platform_archived_companies, app_private.platform_company_actions
  from public, anon, authenticated;

create function app_private.platform_managed_company_bucket(
  p_status text, p_complimentary boolean, p_period_end timestamptz,
  p_cancel_at_end boolean, p_archived boolean
) returns text language sql stable set search_path = '' as $$
  select case
    -- A customer-side restart must not silently bill while hidden from review.
    -- Keep the archival metadata, but surface that company in the main list.
    when p_archived and not p_complimentary and not p_cancel_at_end
      and p_status in ('active','past_due') then 'attention'
    when p_archived then 'archived'
    when not p_complimentary and p_cancel_at_end and p_status in ('active','past_due') then 'paused'
    else app_private.platform_company_bucket(p_status, p_complimentary, p_period_end, now())
  end;
$$;

create function app_private.platform_company_directory_v2(
  p_search text, p_offset integer, p_status text, p_period text, p_sort text
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_needle text := lower(btrim(coalesce(p_search, '')));
begin
  if public.is_platform_superadmin() is not true then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or length(v_needle) > 120
    or (p_status is not null and p_status not in ('active','attention','courtesy','without_plan','canceled','paused','archived'))
    or (p_period is not null and p_period not in ('month','year','none'))
    or p_sort is null or p_sort not in ('name','newest','renewal') then
    raise exception 'Filtros no válidos' using errcode = '22023';
  end if;
  return (
    with matching as (
      select t.id, t.name, t.plan, t.subscription_status, t.billing_interval,
        t.current_period_end, t.is_complimentary, t.created_at, a.archived_at,
        t.cancel_at_period_end,
        app_private.platform_managed_company_bucket(t.subscription_status,
          t.is_complimentary, t.current_period_end, t.cancel_at_period_end,
          a.tenant_id is not null) as billing_bucket
      from public.tenants t
      left join app_private.platform_archived_companies a on a.tenant_id = t.id and a.restored_at is null
      where (v_needle = '' or strpos(lower(t.name), v_needle) > 0 or t.id::text = v_needle)
        and (p_period is null or t.billing_interval = p_period
          or (p_period = 'none' and t.billing_interval is null))
    ), counts as (
      select m.billing_bucket, count(*) as n from matching m
      where m.billing_bucket <> 'archived' group by m.billing_bucket
      union all
      select 'archived', count(*) from matching m where m.archived_at is not null having count(*) > 0
    ), page as (
      select m.*,
        row_number() over (order by
          case when p_sort = 'newest' then m.created_at end desc nulls last,
          case when p_sort = 'renewal' then m.current_period_end end asc nulls last,
          lower(m.name), m.id) as position
      from matching m
      where (p_status is null and m.billing_bucket <> 'archived')
        or (p_status = 'archived' and m.archived_at is not null)
        or (p_status <> 'archived' and m.billing_bucket = p_status)
      order by position
      limit 51 offset p_offset
    ), projected as (
      select p.*,
        (select count(*) from public.memberships m where m.tenant_id = p.id) as member_count,
        exists (select from public.billing_payments b where b.tenant_id = p.id and b.status = 'pending') as has_pending_payment,
        (p.archived_at is null and not p.is_complimentary and p.subscription_status in ('active','past_due')
          and not p.cancel_at_period_end and p.billing_interval in ('month','year')) as pausable,
        (p.archived_at is null and not p.is_complimentary and p.subscription_status = 'active'
          and p.cancel_at_period_end and p.billing_interval in ('month','year') and p.current_period_end > now()) as resumable
      from page p
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(p) - 'position' order by p.position) from projected p), '[]'::jsonb),
      'counts', coalesce((select jsonb_object_agg(c.billing_bucket, c.n) from counts c), '{}'::jsonb),
      'total', coalesce((select sum(c.n) from counts c where
        (p_status is null and c.billing_bucket <> 'archived') or c.billing_bucket = p_status), 0)
    )
  );
end;
$$;

create function public.superadmin_company_directory_v2(
  p_search text, p_offset integer, p_status text, p_period text, p_sort text
) returns jsonb language sql stable security invoker set search_path = ''
begin atomic
  select app_private.platform_company_directory_v2(p_search,p_offset,p_status,p_period,p_sort);
end;

-- This uses the same cancel_at_period_end switch the renewal worker already
-- respects. It never writes payment rows, calls Redsys or changes access dates.
create function app_private.platform_company_action(
  p_tenant uuid, p_action text, p_expected_pause boolean, p_expected_archived_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_company public.tenants%rowtype;
  v_archived_at timestamptz;
begin
  if v_actor is null or public.is_platform_superadmin() is not true then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('pause','resume','archive','restore') or p_expected_pause is null or p_tenant is null then
    raise exception 'Acción no válida' using errcode = '22023';
  end if;
  select * into v_company from public.tenants t where t.id = p_tenant for update;
  if not found then
    raise exception 'No se encuentra la empresa' using errcode = 'P0001';
  end if;
  select a.archived_at into v_archived_at from app_private.platform_archived_companies a where a.tenant_id = p_tenant and a.restored_at is null;
  if v_company.cancel_at_period_end is distinct from p_expected_pause or v_archived_at is distinct from p_expected_archived_at then
    raise exception 'La empresa ha cambiado. Recarga el listado antes de repetir la acción.' using errcode = '40001';
  end if;

  if p_action in ('pause','resume','archive') and exists (
    select from public.billing_payments b where b.tenant_id = p_tenant and b.status = 'pending'
  ) then
    raise exception 'Hay un pago en curso. Espera a que se resuelva.' using errcode = 'P0001';
  end if;
  if p_action = 'restore' then
    if v_archived_at is null then return; end if;
    update app_private.platform_archived_companies
    set restored_at = now() where tenant_id = p_tenant and restored_at is null;
  elsif p_action = 'archive' then
    if v_archived_at is not null then return; end if;
    if not v_company.is_complimentary and v_company.subscription_status in ('active','past_due') and not v_company.cancel_at_period_end then
      raise exception 'Pausa la renovación antes de archivar la empresa.' using errcode = 'P0001';
    end if;
    insert into app_private.platform_archived_companies(tenant_id) values (p_tenant)
    on conflict (tenant_id) do update set archived_at = excluded.archived_at, restored_at = null;
  else
    if v_archived_at is not null or v_company.is_complimentary
      or v_company.subscription_status not in ('active','past_due')
      or v_company.billing_interval is null then
      raise exception 'La empresa no tiene una renovación gestionable.' using errcode = 'P0001';
    end if;
    if p_action = 'resume' and (v_company.subscription_status <> 'active'
      or v_company.current_period_end is null or v_company.current_period_end <= now()) then
      raise exception 'El periodo pagado ya no está activo. No se puede reanudar desde aquí.' using errcode = 'P0001';
    end if;
    if v_company.cancel_at_period_end = (p_action = 'pause') then return; end if;
    update public.tenants set cancel_at_period_end = (p_action = 'pause') where id = p_tenant;
  end if;
  insert into app_private.platform_company_actions (tenant_id,actor_id,action)
  values (p_tenant,v_actor,p_action);
end;
$$;

create function public.superadmin_company_action(
  p_tenant uuid, p_action text, p_expected_pause boolean, p_expected_archived_at timestamptz
) returns void language sql security invoker set search_path = ''
begin atomic
  select app_private.platform_company_action(p_tenant,p_action,p_expected_pause,p_expected_archived_at);
end;

-- Keep the existing global invoice endpoint compatible while allowing exact
-- company and payment reference scopes on the new directory route.
create function app_private.platform_invoice_directory(
  p_search text, p_offset integer, p_filter text, p_tenant uuid, p_reference text
) returns table (
  id uuid, tenant_id uuid, company_name text, invoice_number text, invoice_status text,
  invoice_portal_url text, merchant_order text, amount_cents integer, paid_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
declare v_needle text := lower(btrim(coalesce(p_search,'')));
begin
  if public.is_platform_superadmin() is not true then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or length(v_needle) > 120
    or (p_filter is not null and p_filter not in ('issued','in_progress'))
    or (p_reference is not null and p_reference !~ '^[0-9]{4}[A-Za-z0-9]{4,8}$') then
    raise exception 'Filtros no válidos' using errcode = '22023';
  end if;
  return query
    select p.id, p.tenant_id, t.name, p.invoice_number, p.invoice_status,
      p.invoice_portal_url, p.merchant_order, p.amount_cents, coalesce(p.settled_at,p.created_at)
    from public.billing_payments p join public.tenants t on t.id = p.tenant_id
    where p.status = 'succeeded' and (p.invoice_status is not null or p.invoice_number is not null)
      and (p_tenant is null or p.tenant_id = p_tenant)
      and (p_reference is null or p.merchant_order = p_reference)
      and (p_filter is null or (p_filter = 'issued' and p.invoice_number is not null)
        or (p_filter = 'in_progress' and p.invoice_number is null))
      and (v_needle = '' or strpos(lower(t.name),v_needle) > 0
        or strpos(lower(p.invoice_number),v_needle) > 0
        or strpos(lower(p.merchant_order),v_needle) > 0)
    order by coalesce(p.settled_at,p.created_at) desc, p.id desc
    limit 51 offset p_offset;
end;
$$;

create function public.superadmin_subscription_invoice_directory(
  p_search text, p_offset integer, p_filter text, p_tenant uuid, p_reference text
) returns table (
  id uuid, tenant_id uuid, company_name text, invoice_number text, invoice_status text,
  invoice_portal_url text, merchant_order text, amount_cents integer, paid_at timestamptz
) language sql stable security invoker set search_path = ''
begin atomic
  select * from app_private.platform_invoice_directory(p_search,p_offset,p_filter,p_tenant,p_reference);
end;

revoke all on function app_private.platform_managed_company_bucket(text,boolean,timestamptz,boolean,boolean),
  app_private.platform_company_directory_v2(text,integer,text,text,text),
  app_private.platform_company_action(uuid,text,boolean,timestamptz),
  app_private.platform_invoice_directory(text,integer,text,uuid,text),
  public.superadmin_company_directory_v2(text,integer,text,text,text),
  public.superadmin_company_action(uuid,text,boolean,timestamptz),
  public.superadmin_subscription_invoice_directory(text,integer,text,uuid,text)
  from public, anon, authenticated;
grant execute on function app_private.platform_company_directory_v2(text,integer,text,text,text),
  app_private.platform_company_action(uuid,text,boolean,timestamptz),
  app_private.platform_invoice_directory(text,integer,text,uuid,text),
  public.superadmin_company_directory_v2(text,integer,text,text,text),
  public.superadmin_company_action(uuid,text,boolean,timestamptz),
  public.superadmin_subscription_invoice_directory(text,integer,text,uuid,text)
  to authenticated;

-- Reuse the current overview RPC and preserve its collections projection.
create or replace function app_private.platform_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_month timestamp := date_trunc('month', now() at time zone 'Europe/Madrid');
begin
  if public.is_platform_superadmin() is not true then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return (
    with months as (
      select generate_series(v_month - interval '5 months', v_month, interval '1 month') as month
    ), collections as (
      select date_trunc('month', coalesce(p.settled_at, p.created_at) at time zone 'Europe/Madrid') as month,
        sum(p.amount_cents) as cents, count(*) as total
      from public.billing_payments p
      where p.status = 'succeeded'
        and coalesce(p.settled_at, p.created_at) >= ((v_month - interval '5 months') at time zone 'Europe/Madrid')
        and coalesce(p.settled_at, p.created_at) <= now()
      group by 1
    )
    select jsonb_build_object(
      'companies', app_private.platform_company_directory_v2('',0,null,null,'name')->'counts',
      'collections', (select jsonb_agg(jsonb_build_object(
        'month', to_char(m.month, 'YYYY-MM'), 'cents', coalesce(c.cents, 0), 'count', coalesce(c.total, 0)
      ) order by m.month) from months m left join collections c using (month))
    )
  );
end;
$$;

notify pgrst, 'reload schema';
