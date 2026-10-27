-- A delivery keeps a protected copy of the bearer token so a worker can retry
-- after an Edge Function crash. Browser roles only see operational metadata.
alter table public.service_visit_report_shares
  add constraint service_visit_report_shares_identity_unique
  unique (id, tenant_id, report_version_id);

create table public.service_visit_report_email_deliveries (
  id uuid primary key,
  tenant_id uuid not null,
  report_version_id uuid not null,
  share_id uuid not null,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  token_ciphertext text,
  token_nonce text,
  recipient_email text not null check (char_length(recipient_email) between 3 and 320),
  recipient_name text not null,
  company_name text not null,
  sender_name text not null,
  sender_address text not null,
  reply_to text,
  app_url text not null,
  requested_by uuid not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'retry', 'sent', 'failed', 'uncertain')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_message_id text,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (share_id, tenant_id, report_version_id)
    references public.service_visit_report_shares
      (id, tenant_id, report_version_id) on delete restrict,
  check ((status in ('queued', 'sending', 'retry')
      and token_ciphertext is not null and token_nonce is not null)
    or (status in ('sent', 'failed', 'uncertain')
      and token_ciphertext is null and token_nonce is null)),
  check ((lease_token is null and lease_expires_at is null)
    or (lease_token is not null and lease_expires_at is not null))
);
create index service_visit_report_email_due_idx
  on public.service_visit_report_email_deliveries
  (next_attempt_at, created_at, id)
  where status in ('queued', 'retry', 'sending');
create index service_visit_report_email_version_idx
  on public.service_visit_report_email_deliveries
  (tenant_id, report_version_id, created_at desc);

create function public.protect_service_visit_report_email_delivery()
returns trigger language plpgsql set search_path = '' as $$
begin
  if to_jsonb(new) - 'status' - 'attempts' - 'next_attempt_at'
       - 'lease_token' - 'lease_expires_at' - 'provider_message_id'
       - 'last_error_code' - 'sent_at' - 'token_ciphertext' - 'token_nonce'
     is distinct from
     to_jsonb(old) - 'status' - 'attempts' - 'next_attempt_at'
       - 'lease_token' - 'lease_expires_at' - 'provider_message_id'
       - 'last_error_code' - 'sent_at' - 'token_ciphertext' - 'token_nonce'
     or ((new.token_ciphertext is distinct from old.token_ciphertext
          or new.token_nonce is distinct from old.token_nonce)
       and not (old.token_ciphertext is not null and old.token_nonce is not null
         and new.token_ciphertext is null and new.token_nonce is null
         and new.status in ('sent', 'failed', 'uncertain'))) then
    raise exception 'La entrega no permite cambiar su contenido'
      using errcode = 'P0409';
  end if;
  return new;
end;
$$;
create trigger service_visit_report_email_delivery_immutable
  before update on public.service_visit_report_email_deliveries
  for each row execute function public.protect_service_visit_report_email_delivery();
revoke all on function public.protect_service_visit_report_email_delivery()
  from public, anon, authenticated;

alter table public.service_visit_report_email_deliveries enable row level security;
revoke all on public.service_visit_report_email_deliveries from public, anon, authenticated;
grant select (
  id, tenant_id, report_version_id, share_id, recipient_email,
  status, attempts, next_attempt_at, provider_message_id,
  last_error_code, sent_at, created_at
) on public.service_visit_report_email_deliveries to authenticated;
grant all on public.service_visit_report_email_deliveries to service_role;
create policy service_visit_report_email_deliveries_office_select
  on public.service_visit_report_email_deliveries for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin']::public.app_role[])
  );

-- A short lease serializes workers. An uncertain send is never retried after
-- 23 hours: Resend only keeps idempotency keys for 24 hours.
create function public.claim_service_visit_report_email_delivery(p_id uuid default null)
returns setof public.service_visit_report_email_deliveries
language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  update public.service_visit_report_email_deliveries
    set status = 'uncertain', last_error_code = 'idempotency_window_elapsed',
      lease_token = null, lease_expires_at = null,
      token_ciphertext = null, token_nonce = null
    where status in ('queued', 'retry', 'sending')
      and created_at <= clock_timestamp() - interval '23 hours'
      and (p_id is null or id = p_id);

  select id into target_id from public.service_visit_report_email_deliveries
    where (p_id is null or id = p_id)
      and created_at > clock_timestamp() - interval '23 hours'
      and ((status in ('queued', 'retry') and next_attempt_at <= clock_timestamp())
        or (status = 'sending' and lease_expires_at <= clock_timestamp()))
    order by next_attempt_at, created_at, id
    for update skip locked limit 1;
  if not found then return; end if;

  return query update public.service_visit_report_email_deliveries
    set status = 'sending', attempts = attempts + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = clock_timestamp() + interval '2 minutes'
    where id = target_id returning *;
end;
$$;
revoke all on function public.claim_service_visit_report_email_delivery(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_service_visit_report_email_delivery(uuid)
  to service_role;

create function public.finish_service_visit_report_email_delivery(
  p_id uuid, p_lease_token uuid, p_outcome text,
  p_provider_message_id text default null, p_error_code text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.service_visit_report_email_deliveries%rowtype;
declare final_status text;
begin
  if p_outcome not in ('sent', 'retry', 'failed') then
    raise exception 'Resultado de entrega inválido' using errcode = '22023';
  end if;
  select * into target from public.service_visit_report_email_deliveries
    where id = p_id and status = 'sending' and lease_token = p_lease_token
    for update;
  if not found then return false; end if;
  final_status := case
    when p_outcome = 'sent' then 'sent'
    when p_outcome = 'failed' then 'failed'
    when target.attempts >= 6
      or target.created_at <= clock_timestamp() - interval '23 hours'
      then 'uncertain'
    else 'retry' end;
  update public.service_visit_report_email_deliveries
    set status = final_status,
      next_attempt_at = case when final_status = 'retry' then
        clock_timestamp() + interval '1 minute' * least(30, power(2, target.attempts)::integer)
        else next_attempt_at end,
      lease_token = null, lease_expires_at = null,
      token_ciphertext = case when final_status = 'retry'
        then token_ciphertext else null end,
      token_nonce = case when final_status = 'retry'
        then token_nonce else null end,
      provider_message_id = case when final_status = 'sent'
        then p_provider_message_id else provider_message_id end,
      last_error_code = case when final_status = 'sent' then null
        else left(coalesce(p_error_code, 'delivery_failed'), 80) end,
      sent_at = case when final_status = 'sent' then clock_timestamp() else sent_at end
    where id = p_id;
  return true;
end;
$$;
revoke all on function public.finish_service_visit_report_email_delivery(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.finish_service_visit_report_email_delivery(
  uuid, uuid, text, text, text
) to service_role;

-- Reconcile pending sends every five minutes, including after an Edge crash.
create function public.run_visit_report_email_dispatch() returns void
language plpgsql security definer set search_path = '' as $$
declare secret text;
declare worker_url text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets
    where name = 'cron_secret' limit 1;
  select decrypted_secret into worker_url from vault.decrypted_secrets
    where name = 'visit_report_email_worker_url' limit 1;
  if secret is null or worker_url is null
     or worker_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/visit-report-email-worker$' then
    raise warning 'run_visit_report_email_dispatch: faltan secretos del trabajador en Vault';
    return;
  end if;
  perform net.http_post(
    url := worker_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke all on function public.run_visit_report_email_dispatch()
  from public, anon, authenticated;
select cron.schedule('visit-report-email-dispatch', '*/5 * * * *',
  'select public.run_visit_report_email_dispatch()');
