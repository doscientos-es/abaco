-- Lanza send-reminders cada día a las 08:00 (UTC). El secreto no está aquí: se lee de Supabase Vault
-- (secreto llamado `cron_secret`, con el mismo valor que CRON_SECRET de la función).
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.run_send_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if secret is null then
    raise warning 'run_send_reminders: falta el secreto cron_secret en Vault';
    return;
  end if;
  perform net.http_post(
    url := 'https://vqyicgarlksirpzrngut.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke all on function public.run_send_reminders() from public, anon, authenticated;

select cron.unschedule('send-reminders') where exists (select 1 from cron.job where jobname = 'send-reminders');
select cron.schedule('send-reminders', '0 8 * * *', 'select public.run_send_reminders()');
