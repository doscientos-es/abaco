-- Browser endpoints are bearer-like secrets: only the service role may read them.
create table public.vacation_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.vacation_push_subscriptions enable row level security;
revoke all on public.vacation_push_subscriptions from public, anon, authenticated;
grant all on public.vacation_push_subscriptions to service_role;

create function public.register_vacation_push_subscription(
  p_endpoint text, p_p256dh text, p_auth_key text
) returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null or not exists (select 1 from public.memberships where user_id = uid) then
    raise exception 'No tienes permiso para activar avisos' using errcode = '42501';
  end if;
  if p_endpoint is null or length(p_endpoint) > 2048
    or p_endpoint !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)/[^[:space:]#]*$'
    or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}$'
    or p_auth_key is null or p_auth_key !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'Suscripción push inválida' using errcode = '22023';
  end if;
  perform 1 from public.profiles where id = uid for update;
  if not exists (select 1 from public.vacation_push_subscriptions where endpoint = p_endpoint and user_id = uid)
    and (select count(*) from public.vacation_push_subscriptions where user_id = uid) >= 10 then
    raise exception 'Límite de dispositivos alcanzado' using errcode = '22023';
  end if;
  insert into public.vacation_push_subscriptions (user_id, endpoint, p256dh, auth_key)
  values (uid, p_endpoint, p_p256dh, p_auth_key)
  on conflict (endpoint) do update set user_id = excluded.user_id,
    p256dh = excluded.p256dh, auth_key = excluded.auth_key;
end;
$$;
revoke all on function public.register_vacation_push_subscription(text, text, text) from public, anon;
grant execute on function public.register_vacation_push_subscription(text, text, text) to authenticated;

create function public.remove_vacation_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.vacation_push_subscriptions where user_id = (select auth.uid()) and endpoint = p_endpoint;
$$;
revoke all on function public.remove_vacation_push_subscription(text) from public, anon;
grant execute on function public.remove_vacation_push_subscription(text) to authenticated;