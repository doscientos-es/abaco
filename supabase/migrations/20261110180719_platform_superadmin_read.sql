-- Platform access is granted and revoked only by a trusted database operator.
-- Membership in a customer company never grants this role.
create table public.platform_superadmins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table public.platform_superadmins enable row level security;
revoke all on public.platform_superadmins from public, anon, authenticated;

create function public.is_platform_superadmin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_superadmins where user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_platform_superadmin() from public, anon;
grant execute on function public.is_platform_superadmin() to authenticated;

-- These functions expose an explicit allowlist of fields, not unrestricted tenant or
-- payment records. In particular, bank references and merchant orders stay server-side.
create function public.superadmin_companies(p_search text default '', p_offset integer default 0)
returns table (
  id uuid, name text, plan text, subscription_status text, billing_interval text,
  current_period_end timestamptz, is_complimentary boolean, member_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_platform_superadmin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or length(coalesce(p_search, '')) > 120 then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;
  return query
    select t.id, t.name, t.plan, t.subscription_status, t.billing_interval,
      t.current_period_end, t.is_complimentary,
      (select count(*) from public.memberships m where m.tenant_id = t.id)
    from public.tenants t
    where strpos(lower(t.name), lower(trim(coalesce(p_search, '')))) > 0
      or coalesce(p_search, '') = ''
    order by lower(t.name), t.id
    limit 50 offset p_offset;
end;
$$;
revoke all on function public.superadmin_companies(text, integer) from public, anon;
grant execute on function public.superadmin_companies(text, integer) to authenticated;

create function public.superadmin_payments(
  p_tenant uuid, p_offset integer default 0, p_status text default null
)
returns table (
  id uuid, kind text, plan text, period text, amount_cents integer, status text,
  created_at timestamptz, settled_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_platform_superadmin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_tenant is null or p_offset is null or p_offset < 0
    or (p_status is not null and p_status not in ('pending', 'succeeded', 'failed')) then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;
  return query
    select p.id, p.kind, p.plan, p.period, p.amount_cents, p.status, p.created_at, p.settled_at
    from public.billing_payments p
    where p.tenant_id = p_tenant and (p_status is null or p.status = p_status)
    order by p.created_at desc, p.id desc
    limit 50 offset p_offset;
end;
$$;
revoke all on function public.superadmin_payments(uuid, integer, text) from public, anon;
grant execute on function public.superadmin_payments(uuid, integer, text) to authenticated;

create function public.superadmin_payment_summary(p_tenant uuid)
returns table (succeeded_count bigint, succeeded_cents bigint, failed_count bigint, pending_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_platform_superadmin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_tenant is null then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;
  return query select
    count(*) filter (where p.status = 'succeeded'),
    coalesce(sum(p.amount_cents) filter (where p.status = 'succeeded'), 0),
    count(*) filter (where p.status = 'failed'),
    count(*) filter (where p.status = 'pending')
  from public.billing_payments p where p.tenant_id = p_tenant;
end;
$$;
revoke all on function public.superadmin_payment_summary(uuid) from public, anon;
grant execute on function public.superadmin_payment_summary(uuid) to authenticated;