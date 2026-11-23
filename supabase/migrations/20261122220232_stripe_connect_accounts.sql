-- OAuth states are one-use and scoped to the initiating administrator and tenant.
create table app_private.stripe_connect_oauth_states (
  state_hash text primary key check (state_hash ~ '^[A-Za-z0-9_-]{43}$'),
  tenant_id uuid not null,
  user_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id, user_id) references public.memberships(tenant_id, user_id) on delete cascade
);
revoke all on app_private.stripe_connect_oauth_states from public, anon, authenticated, service_role;

create table app_private.stripe_connect_accounts (
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  livemode boolean not null,
  account_id text not null check (account_id ~ '^acct_[a-zA-Z0-9]+$'),
  connected_by uuid not null references auth.users(id) on delete restrict,
  connected_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, livemode),
  unique (account_id, livemode)
);
revoke all on app_private.stripe_connect_accounts from public, anon, authenticated, service_role;

create function public.save_stripe_connect_oauth_state(
  p_state_hash text, p_tenant_id uuid, p_user_id uuid, p_expires_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_state_hash is null or p_state_hash !~ '^[A-Za-z0-9_-]{43}$'
    or p_expires_at is null or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp() + interval '11 minutes' then
    raise exception 'invalid_stripe_oauth_state' using errcode = '22023';
  end if;
  perform 1 from public.memberships
    where tenant_id = p_tenant_id and user_id = p_user_id and role in ('owner', 'admin') for share;
  if not found or not public.tenant_can_write(p_tenant_id) then
    raise exception 'stripe_connect_forbidden' using errcode = '42501';
  end if;
  insert into app_private.stripe_connect_oauth_states(state_hash, tenant_id, user_id, expires_at)
    values (p_state_hash, p_tenant_id, p_user_id, p_expires_at);
end;
$$;

create function public.consume_stripe_connect_oauth_state(p_state_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target app_private.stripe_connect_oauth_states%rowtype;
begin
  delete from app_private.stripe_connect_oauth_states where state_hash = p_state_hash returning * into target;
  if not found then return null; end if;
  return jsonb_build_object('tenantId', target.tenant_id, 'userId', target.user_id,
    'expiresAt', floor(extract(epoch from target.expires_at) * 1000));
end;
$$;

create function public.save_stripe_connect_account(
  p_tenant_id uuid, p_user_id uuid, p_account_id text, p_livemode boolean
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_account_id is null or p_account_id !~ '^acct_[a-zA-Z0-9]+$' or p_livemode is null then
    raise exception 'invalid_stripe_account' using errcode = '22023';
  end if;
  perform 1 from public.memberships
    where tenant_id = p_tenant_id and user_id = p_user_id and role in ('owner', 'admin') for share;
  if not found or not public.tenant_can_write(p_tenant_id) then
    raise exception 'stripe_connect_forbidden' using errcode = '42501';
  end if;
  insert into app_private.stripe_connect_accounts(tenant_id, livemode, account_id, connected_by)
    values (p_tenant_id, p_livemode, p_account_id, p_user_id)
    on conflict (tenant_id, livemode) do update set connected_by = excluded.connected_by
      where app_private.stripe_connect_accounts.account_id = excluded.account_id;
  if not found then
    raise exception 'stripe_account_already_connected' using errcode = '23505';
  end if;
end;
$$;
revoke all on function public.save_stripe_connect_oauth_state(text, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.consume_stripe_connect_oauth_state(text) from public, anon, authenticated;
revoke all on function public.save_stripe_connect_account(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.save_stripe_connect_oauth_state(text, uuid, uuid, timestamptz) to service_role;
grant execute on function public.consume_stripe_connect_oauth_state(text) to service_role;
grant execute on function public.save_stripe_connect_account(uuid, uuid, text, boolean) to service_role;