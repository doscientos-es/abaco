-- Assignment is granted only by trusted billing code after a successful payment.
-- No authenticated user can write these tables directly.
create table app_private.ai_assignments (
  tenant_id uuid not null,
  user_id uuid not null,
  enabled boolean not null default false,
  valid_until timestamptz not null,
  primary key (tenant_id, user_id),
  foreign key (tenant_id, user_id) references public.memberships (tenant_id, user_id) on delete cascade
);
create table app_private.ai_monthly_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  month date not null,
  requests integer not null check (requests between 1 and 200),
  primary key (tenant_id, user_id, month)
);
alter table app_private.ai_assignments enable row level security;
alter table app_private.ai_monthly_usage enable row level security;
revoke all on app_private.ai_assignments, app_private.ai_monthly_usage from public, anon, authenticated;

-- A UI hint only; every request independently checks its task and reserves quota.
create function public.ai_my_access(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.tenant_can_write(p_tenant) and exists (
    select 1 from app_private.ai_assignments a
    join public.memberships m on (m.tenant_id, m.user_id) = (a.tenant_id, a.user_id)
    where a.tenant_id = p_tenant and a.user_id = (select auth.uid())
      and a.enabled and a.valid_until > now() and m.role::text in ('owner','admin','editor')
  ), false);
$$;
revoke all on function public.ai_my_access(uuid) from public, anon;
grant execute on function public.ai_my_access(uuid) to authenticated;

-- Called only after the API verifies the identity token. Lock the assignment and
-- membership so a concurrent revocation cannot race the authorization decision.
create function public.reserve_ai_request(p_tenant uuid, p_user uuid, p_task text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  member_role text;
  current_month date := date_trunc('month', now() at time zone 'Europe/Madrid')::date;
  reserved integer;
begin
  if p_tenant is null or p_user is null or p_task is null or p_task not in ('estimate','receipt') then
    return 'forbidden';
  end if;
  select m.role::text into member_role from app_private.ai_assignments a
    join public.memberships m on (m.tenant_id, m.user_id) = (a.tenant_id, a.user_id)
    where a.tenant_id = p_tenant and a.user_id = p_user
      and a.enabled and a.valid_until > now() for update of a, m;
  if member_role is null or not public.tenant_can_write(p_tenant)
    or (p_task = 'estimate' and member_role not in ('owner','admin','editor'))
    or (p_task = 'receipt' and member_role not in ('owner','admin')) then
    return 'forbidden';
  end if;
  insert into app_private.ai_monthly_usage as usage (tenant_id, user_id, month, requests)
    values (p_tenant, p_user, current_month, 1)
    on conflict (tenant_id, user_id, month) do update set requests = usage.requests + 1
      where usage.requests < 200
    returning requests into reserved;
  return case when reserved is null then 'limit' else 'allowed' end;
end;
$$;
revoke all on function public.reserve_ai_request(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_ai_request(uuid,uuid,text) to service_role;