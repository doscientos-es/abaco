-- Only the server may read a connection, after rechecking the tenant administrator.
create function public.stripe_connect_account_exists(
  p_tenant_id uuid, p_user_id uuid, p_livemode boolean
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.memberships
    where tenant_id = p_tenant_id and user_id = p_user_id and role in ('owner', 'admin')) then
    raise exception 'stripe_connect_forbidden' using errcode = '42501';
  end if;
  return exists (select 1 from app_private.stripe_connect_accounts
    where tenant_id = p_tenant_id and livemode = p_livemode);
end;
$$;
revoke all on function public.stripe_connect_account_exists(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.stripe_connect_account_exists(uuid, uuid, boolean) to service_role;