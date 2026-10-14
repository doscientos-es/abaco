-- Aviso de apertura, seguimiento de presupuestos sin respuesta y resumen semanal.
alter table public.estimates add column if not exists sent_at timestamptz;
alter table public.estimates add column if not exists viewed_at timestamptz;
alter table public.estimates add column if not exists followup_sent_at timestamptz;
alter table public.tenants add column if not exists weekly_summary boolean not null default true;

-- Presupuestos ya enviados: se toma la última modificación como fecha aproximada de envío.
update public.estimates set sent_at = updated_at where status <> 'draft' and sent_at is null;

-- `sent_at` se fija la primera vez que el presupuesto pasa a "enviado".
create or replace function public.estimates_set_sent_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'sent' and new.sent_at is null then
    new.sent_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.estimates_set_sent_at() from public, anon, authenticated;

drop trigger if exists estimates_set_sent_at on public.estimates;
create trigger estimates_set_sent_at before insert or update of status on public.estimates
  for each row execute function public.estimates_set_sent_at();

-- Resumen semanal: cada lunes a las 07:30 (UTC). Mismo secreto de Vault que los otros trabajos.
create or replace function public.run_weekly_summary() returns void
language plpgsql security definer set search_path = '' as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if secret is null then
    raise warning 'run_weekly_summary: falta el secreto cron_secret en Vault';
    return;
  end if;
  perform net.http_post(
    url := 'https://vqyicgarlksirpzrngut.supabase.co/functions/v1/weekly-summary',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke all on function public.run_weekly_summary() from public, anon, authenticated;

select cron.unschedule('weekly-summary') where exists (select 1 from cron.job where jobname = 'weekly-summary');
select cron.schedule('weekly-summary', '30 7 * * 1', 'select public.run_weekly_summary()');
