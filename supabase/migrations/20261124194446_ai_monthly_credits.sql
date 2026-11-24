-- Purchased credits belong to the person, survive months and membership changes,
-- and are only consumed after the monthly allowance is exhausted.
create table app_private.ai_credit_balances (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  user_id uuid not null,
  credits integer not null default 0 check (credits >= 0),
  primary key (tenant_id, user_id)
);
alter table app_private.ai_credit_balances enable row level security;
revoke all on app_private.ai_credit_balances from public, anon, authenticated;

alter table app_private.ai_monthly_usage drop constraint ai_monthly_usage_requests_check;
alter table app_private.ai_monthly_usage add constraint ai_monthly_usage_requests_check
  check (requests between 1 and 500);

-- Courtesy is managed by the platform, never by the tenant's members.
create or replace function public.ai_my_access(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.tenant_can_write(p_tenant) and exists (
    select 1 from public.memberships m join public.tenants t on t.id = m.tenant_id
    where m.tenant_id = p_tenant and m.user_id = (select auth.uid())
      and m.role::text in ('owner','admin','editor')
      and (t.is_complimentary or exists (
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
  if not courtesy then
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

create function public.ai_my_credits(p_tenant uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.ai_my_access(p_tenant) then jsonb_build_object(
    'monthly_limit', 500,
    'monthly_used', coalesce((select u.requests from app_private.ai_monthly_usage u
      where u.tenant_id = p_tenant and u.user_id = (select auth.uid())
        and u.month = date_trunc('month', now() at time zone 'Europe/Madrid')::date), 0),
    'extra_remaining', coalesce((select b.credits from app_private.ai_credit_balances b
      where b.tenant_id = p_tenant and b.user_id = (select auth.uid())), 0)
  ) else null end;
$$;
revoke all on function public.ai_my_credits(uuid) from public, anon;
grant execute on function public.ai_my_credits(uuid) to authenticated;
notify pgrst, 'reload schema';
