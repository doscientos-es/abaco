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

create table public.vacation_notification_jobs (
  notification_id uuid primary key references public.vacation_decision_notifications(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'retry', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  delivery_channel text check (delivery_channel in ('push', 'email', 'skipped')),
  last_error_code text,
  created_at timestamptz not null default clock_timestamp(),
  check ((lease_token is null) = (lease_expires_at is null)),
  check ((status = 'processing') = (lease_token is not null))
);
create index vacation_notification_jobs_due_idx on public.vacation_notification_jobs (next_attempt_at)
  where status in ('queued', 'retry', 'processing');
alter table public.vacation_notification_jobs enable row level security;
revoke all on public.vacation_notification_jobs from public, anon, authenticated;
grant all on public.vacation_notification_jobs to service_role;

create function public.enqueue_vacation_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.vacation_notification_jobs (notification_id) values (new.id);
  return new;
end;
$$;
create trigger vacation_notification_enqueue after insert on public.vacation_decision_notifications
  for each row execute function public.enqueue_vacation_notification();
revoke all on function public.enqueue_vacation_notification() from public, anon, authenticated;

create function public.claim_vacation_notification_job()
returns setof public.vacation_notification_jobs language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  select notification_id into target from public.vacation_notification_jobs
  where (status in ('queued', 'retry') and next_attempt_at <= clock_timestamp())
    or (status = 'processing' and lease_expires_at <= clock_timestamp())
  order by next_attempt_at, created_at for update skip locked limit 1;
  if not found then return; end if;
  return query update public.vacation_notification_jobs set status = 'processing', attempts = attempts + 1,
    lease_token = gen_random_uuid(), lease_expires_at = clock_timestamp() + interval '5 minutes'
  where notification_id = target returning *;
end;
$$;
revoke all on function public.claim_vacation_notification_job() from public, anon, authenticated;
grant execute on function public.claim_vacation_notification_job() to service_role;

create function public.finish_vacation_notification_job(
  p_id uuid, p_token uuid, p_channel text, p_error text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_channel is not null and p_channel not in ('push', 'email', 'skipped') then
    raise exception 'Canal inválido' using errcode = '22023';
  end if;
  update public.vacation_notification_jobs set
    status = case when p_channel is not null then 'sent' when attempts >= 8 then 'failed' else 'retry' end,
    delivery_channel = p_channel,
    next_attempt_at = case when p_channel is null then clock_timestamp() + interval '1 minute'
      * least(60, power(2, least(attempts, 6))::integer) else next_attempt_at end,
    last_error_code = case when p_channel is null then left(coalesce(p_error, 'delivery_failed'), 80) else null end,
    lease_token = null, lease_expires_at = null
  where notification_id = p_id and status = 'processing' and lease_token = p_token;
  return found;
end;
$$;
revoke all on function public.finish_vacation_notification_job(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.finish_vacation_notification_job(uuid, uuid, text, text) to service_role;