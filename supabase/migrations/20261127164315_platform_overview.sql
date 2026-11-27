-- Keep privileged reads out of the exposed schema. Public SQL wrappers bind the
-- private functions at creation time without granting lookup access to app_private.
create function app_private.platform_company_bucket(
  p_status text, p_complimentary boolean, p_period_end timestamptz, p_now timestamptz
) returns text language sql immutable set search_path = '' as $$
  select case
    when p_complimentary then 'courtesy'
    when p_status = 'past_due' or (p_status = 'active' and p_period_end <= p_now) then 'attention'
    when p_status = 'active' then 'active'
    when p_status = 'canceled' then 'canceled'
    else 'without_plan'
  end;
$$;
revoke all on function app_private.platform_company_bucket(text,boolean,timestamptz,timestamptz)
  from public, anon, authenticated;

create function app_private.platform_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_month timestamp := date_trunc('month', now() at time zone 'Europe/Madrid');
begin
  if public.is_platform_superadmin() is not true then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return (
    with companies as (
      select app_private.platform_company_bucket(
        t.subscription_status, t.is_complimentary, t.current_period_end, now()
      ) as bucket, count(*) as total
      from public.tenants t group by 1
    ),
    months as (
      select generate_series(v_month - interval '5 months', v_month, interval '1 month') as month
    ),
    collections as (
      select date_trunc('month', coalesce(p.settled_at, p.created_at) at time zone 'Europe/Madrid') as month,
        sum(p.amount_cents) as cents, count(*) as total
      from public.billing_payments p
      where p.status = 'succeeded'
        and coalesce(p.settled_at, p.created_at) >=
          ((v_month - interval '5 months') at time zone 'Europe/Madrid')
        and coalesce(p.settled_at, p.created_at) <= now()
      group by 1
    )
    select jsonb_build_object(
      'companies', coalesce((select jsonb_object_agg(bucket, total) from companies), '{}'::jsonb),
      'collections', (select jsonb_agg(jsonb_build_object(
        'month', to_char(m.month, 'YYYY-MM'),
        'cents', coalesce(c.cents, 0),
        'count', coalesce(c.total, 0)
      ) order by m.month) from months m left join collections c using (month))
    )
  );
end;
$$;

create function app_private.platform_company_directory(p_search text, p_offset integer, p_status text)
returns table (
  id uuid, name text, plan text, subscription_status text, billing_interval text,
  current_period_end timestamptz, is_complimentary boolean, member_count bigint, billing_bucket text
) language plpgsql stable security definer set search_path = '' as $$
declare v_needle text := lower(btrim(coalesce(p_search, '')));
begin
  if public.is_platform_superadmin() is not true then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or length(v_needle) > 120
    or (p_status is not null and p_status not in ('active', 'attention', 'courtesy', 'without_plan', 'canceled')) then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;
  return query
    select t.id, t.name, t.plan, t.subscription_status, t.billing_interval,
      t.current_period_end, t.is_complimentary,
      (select count(*) from public.memberships m where m.tenant_id = t.id), t.bucket
    from (
      select tenants.*, app_private.platform_company_bucket(
        tenants.subscription_status, tenants.is_complimentary, tenants.current_period_end, now()
      ) as bucket
      from public.tenants
      where v_needle = '' or strpos(lower(tenants.name), v_needle) > 0
    ) t
    where p_status is null or t.bucket = p_status
    order by lower(t.name), t.id
    limit 51 offset p_offset;
end;
$$;

create function public.superadmin_overview() returns jsonb
language sql stable security invoker set search_path = ''
begin atomic
  select app_private.platform_overview();
end;

create function public.superadmin_company_directory(p_search text, p_offset integer, p_status text)
returns table (
  id uuid, name text, plan text, subscription_status text, billing_interval text,
  current_period_end timestamptz, is_complimentary boolean, member_count bigint, billing_bucket text
) language sql stable security invoker set search_path = ''
begin atomic
  select * from app_private.platform_company_directory(p_search, p_offset, p_status);
end;

revoke all on function app_private.platform_overview(),
  app_private.platform_company_directory(text,integer,text),
  public.superadmin_overview(),
  public.superadmin_company_directory(text,integer,text) from public, anon, authenticated;
grant execute on function app_private.platform_overview(),
  app_private.platform_company_directory(text,integer,text),
  public.superadmin_overview(),
  public.superadmin_company_directory(text,integer,text) to authenticated;

notify pgrst, 'reload schema';
