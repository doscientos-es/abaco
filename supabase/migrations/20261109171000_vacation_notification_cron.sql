-- The worker URL and shared secret are configured per environment in Vault.
create function public.run_vacation_notification_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare
  secret text;
  worker_url text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  select decrypted_secret into worker_url from vault.decrypted_secrets
    where name = 'vacation_notification_worker_url' limit 1;
  if secret is null or worker_url is null then
    raise warning 'vacation notification worker is not configured';
    return;
  end if;
  perform net.http_post(url := worker_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb);
end;
$$;
revoke all on function public.run_vacation_notification_worker() from public, anon, authenticated;
select cron.schedule('vacation-notification-worker', '* * * * *', 'select public.run_vacation_notification_worker()');