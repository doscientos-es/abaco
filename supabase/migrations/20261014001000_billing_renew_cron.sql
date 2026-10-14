-- Lanza billing-renew una vez al día a las 07:00 (UTC). Usa el mismo secreto de Vault (`cron_secret`)
-- que send-reminders. billing_due_renewals ya evita repetir un intento en 20 h.
create or replace function public.run_billing_renew() returns void
language plpgsql security definer set search_path = '' as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if secret is null then
    raise warning 'run_billing_renew: falta el secreto cron_secret en Vault';
    return;
  end if;
  perform net.http_post(
    url := 'https://vqyicgarlksirpzrngut.supabase.co/functions/v1/billing-renew',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke all on function public.run_billing_renew() from public, anon, authenticated;

select cron.unschedule('billing-renew') where exists (select 1 from cron.job where jobname = 'billing-renew');
select cron.schedule('billing-renew', '0 7 * * *', 'select public.run_billing_renew()');
