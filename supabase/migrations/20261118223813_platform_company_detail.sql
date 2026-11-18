-- A company link must not depend on its current position in the directory.
create function public.superadmin_company(p_tenant uuid)
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
  return query
    select t.id, t.name, t.plan, t.subscription_status, t.billing_interval,
      t.current_period_end, t.is_complimentary,
      (select count(*) from public.memberships m where m.tenant_id = t.id)
    from public.tenants t
    where t.id = p_tenant;
end;
$$;
revoke all on function public.superadmin_company(uuid) from public, anon;
grant execute on function public.superadmin_company(uuid) to authenticated;
