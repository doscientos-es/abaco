-- pg_net dispatches after commit, so a rolled-back visit never wakes the worker.
-- The periodic worker remains necessary for delayed retries and lost requests.
create or replace function public.run_google_calendar_sync_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets
    where name = 'google_calendar_sync_cron_secret' limit 1;
  if secret is null then
    raise warning 'google calendar sync worker is not configured';
    return;
  end if;
  perform net.http_post(
    url := 'https://vqyicgarlksirpzrngut.supabase.co/functions/v1/google-calendar-sync-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

create function app_private.wake_google_calendar_sync_worker() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.available_at > clock_timestamp()
    or (tg_op = 'UPDATE' and new.generation = old.generation)
    or current_setting('app.google_calendar_worker_woken', true) = 'true' then
    return null;
  end if;
  perform set_config('app.google_calendar_worker_woken', 'true', true);
  begin
    perform public.run_google_calendar_sync_worker();
  exception when others then
    -- A temporary dispatch failure must not prevent saving the visit.
    raise warning 'google calendar worker dispatch failed';
  end;
  return null;
end;
$$;
revoke all on function app_private.wake_google_calendar_sync_worker()
  from public, anon, authenticated, service_role;

create trigger google_calendar_jobs_wake_worker
  after insert or update of generation on public.google_calendar_sync_jobs
  for each row execute function app_private.wake_google_calendar_sync_worker();
