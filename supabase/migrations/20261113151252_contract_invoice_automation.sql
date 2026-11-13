-- Daily issuance uses the scheduled draft due date. Old overdue drafts remain manual.
create table app_private.contract_invoice_automation_settings (
  singleton boolean primary key default true check (singleton),
  enabled_at timestamptz not null default clock_timestamp()
);
insert into app_private.contract_invoice_automation_settings default values;
revoke all on app_private.contract_invoice_automation_settings from public, anon, authenticated, service_role;

create table public.contract_invoice_deliveries (
  invoice_id uuid primary key,
  tenant_id uuid not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_until timestamptz,
  sender_address text,
  provider_email_id text,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (invoice_id, tenant_id) references public.invoices(id, tenant_id) on delete restrict
);
create index contract_invoice_deliveries_due_idx on public.contract_invoice_deliveries(next_attempt_at)
  where status in ('pending', 'processing');
alter table public.contract_invoice_deliveries enable row level security;
revoke all on public.contract_invoice_deliveries from public, anon, authenticated, service_role;

create table public.contract_invoice_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid not null references public.contract_invoice_deliveries(invoice_id) on delete restrict,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique (invoice_id, recipient_id),
  foreign key (invoice_id, tenant_id) references public.invoices(id, tenant_id) on delete restrict
);
create index contract_invoice_notifications_recipient_idx
  on public.contract_invoice_notifications(tenant_id, recipient_id, created_at desc);
alter table public.contract_invoice_notifications enable row level security;
revoke all on public.contract_invoice_notifications from public, anon, authenticated, service_role;

-- Both manual and scheduled issuance share locking, revision checks and numbering triggers.
create function app_private.issue_contract_period_invoice(
  p_tenant_id uuid, p_draft_id uuid, p_expected_revision integer,
  p_operation_id uuid, p_issued_on date, p_allow_overdue boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.invoice_contract_period_drafts%rowtype; created_id uuid;
begin
  if p_expected_revision is null or p_expected_revision < 1 or p_operation_id is null
     or p_issued_on is null then
    raise exception 'Datos de emisión inválidos' using errcode = '22023';
  end if;
  select * into target from public.invoice_contract_period_drafts
    where id = p_draft_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Borrador no encontrado' using errcode = 'P0002'; end if;
  if target.status = 'issued' then
    if target.issue_operation_id = p_operation_id then return target.issued_invoice_id; end if;
    raise exception 'El borrador ya se emitió' using errcode = 'P0409';
  end if;
  if target.revision <> p_expected_revision then
    raise exception 'El borrador cambió; recarga antes de emitir' using errcode = 'P0409';
  end if;
  if target.due_date < p_issued_on and not p_allow_overdue then
    raise exception 'La fecha de vencimiento ya pasó' using errcode = '22023';
  end if;
  if exists (select 1 from public.invoices where contract_period_id = target.contract_period_id) then
    raise exception 'Este periodo ya se facturó' using errcode = 'P0409';
  end if;
  insert into public.invoices (
    tenant_id, contract_period_id, issue_operation_id, client_id,
    concept, total_cents, vat_rate, status, issued_at, due_date
  ) values (
    target.tenant_id, target.contract_period_id, p_operation_id, target.client_id,
    target.concept, target.total_cents, target.vat_rate, 'issued', p_issued_on, target.due_date
  ) returning id into created_id;
  update public.invoice_contract_period_drafts set status = 'issued', issued_invoice_id = created_id,
    issue_operation_id = p_operation_id, updated_at = clock_timestamp() where id = target.id;
  return created_id;
end;
$$;
revoke all on function app_private.issue_contract_period_invoice(uuid, uuid, integer, uuid, date, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.issue_invoice_contract_period_draft(
  p_tenant_id uuid, p_draft_id uuid, p_expected_revision integer, p_operation_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
      array['owner', 'admin']::public.app_role[]) or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para emitir facturas' using errcode = '42501';
  end if;
  return app_private.issue_contract_period_invoice(
    p_tenant_id, p_draft_id, p_expected_revision, p_operation_id, current_date
  );
end;
$$;

create function public.run_contract_invoice_automation() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare draft record; invoice public.invoices%rowtype; company public.tenants%rowtype;
  issued integer := 0; failures integer := 0; today date; created_id uuid;
begin
  perform public.run_contract_billing_generation();
  for draft in
    select d.*, c.timezone from public.invoice_contract_period_drafts d
    join public.service_contracts c on c.id = d.contract_id and c.tenant_id = d.tenant_id
    cross join app_private.contract_invoice_automation_settings settings
    where d.status = 'draft' and c.status = 'active' and public.tenant_can_write(c.tenant_id)
      and d.due_date >= (settings.enabled_at at time zone c.timezone)::date
      and d.due_date <= (clock_timestamp() at time zone c.timezone)::date
      and not exists (select 1 from public.invoices i where i.contract_period_id = d.contract_period_id)
    order by d.tenant_id, d.contract_id, d.due_date, d.id
    for update of d, c skip locked
  loop
    begin
      today := (clock_timestamp() at time zone draft.timezone)::date;
      created_id := app_private.issue_contract_period_invoice(
        draft.tenant_id, draft.id, draft.revision, draft.id, today, true
      );
      select * into strict invoice from public.invoices where id = created_id;
      select * into strict company from public.tenants where id = draft.tenant_id;
      insert into public.contract_invoice_deliveries(invoice_id, tenant_id, payload, status, last_error)
      values (invoice.id, invoice.tenant_id, jsonb_build_object(
        'invoice', jsonb_build_object('number', invoice.number, 'concept', invoice.concept,
          'total_cents', invoice.total_cents, 'vat_rate', invoice.vat_rate,
          'issued_at', invoice.issued_at, 'due_date', invoice.due_date,
          'document_snapshot', invoice.document_snapshot),
        'intro', company.invoice_email_intro, 'signature', company.email_signature,
        'from_name', coalesce(nullif(trim(company.email_from_name), ''), company.name)
      ), case when trim(coalesce(invoice.document_snapshot #>> '{client,email}', ''))
        ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then 'pending' else 'failed' end,
        case when trim(coalesce(invoice.document_snapshot #>> '{client,email}', ''))
        ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then null else 'email_missing' end);
      insert into public.contract_invoice_notifications(tenant_id, invoice_id, recipient_id)
      select invoice.tenant_id, invoice.id, m.user_id from public.memberships m
        where m.tenant_id = invoice.tenant_id and m.role in ('owner', 'admin');
      issued := issued + 1;
    exception when others then
      failures := failures + 1;
      insert into public.contract_billing_job_errors(tenant_id, contract_id, error_code, message)
      values (draft.tenant_id, draft.contract_id, sqlstate, 'No se pudo emitir automáticamente el periodo')
      on conflict (contract_id, error_code, message) do update set last_seen_at = clock_timestamp(),
        occurrences = public.contract_billing_job_errors.occurrences + 1, resolved_at = null;
    end;
  end loop;
  return jsonb_build_object('issued', issued, 'errors', failures);
end;
$$;
revoke all on function public.run_contract_invoice_automation() from public, anon, authenticated, service_role;

create function public.claim_contract_invoice_delivery(p_sender_address text)
returns setof public.contract_invoice_deliveries
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if p_sender_address is null or p_sender_address !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' then
    raise exception 'Remitente inválido' using errcode = '22023';
  end if;
  -- A manual send recorded before the worker gets a lease already satisfies delivery.
  with delivered as (
    update public.contract_invoice_deliveries d set status = 'sent', last_error = null,
      lease_token = null, lease_until = null
    from public.invoices i where i.id = d.invoice_id and i.tenant_id = d.tenant_id
      and i.email_accepted_at is not null and d.status in ('pending', 'processing')
      and (d.lease_until is null or d.lease_until < clock_timestamp())
    returning d.invoice_id
  ) update public.contract_invoice_notifications set read_at = null
      where invoice_id in (select invoice_id from delivered);
  -- Never blindly resend outside the provider's 24-hour idempotency window.
  with expired as (
    update public.contract_invoice_deliveries set status = 'failed', lease_token = null,
      lease_until = null, last_error = 'retry_window_elapsed'
    where status in ('pending', 'processing')
      and (lease_until is null or lease_until < clock_timestamp())
      and (attempts >= 8 or first_attempt_at < clock_timestamp() - interval '20 hours')
    returning invoice_id
  ) update public.contract_invoice_notifications set read_at = null
      where invoice_id in (select invoice_id from expired);
  select d.invoice_id into target from public.contract_invoice_deliveries d
    join public.tenants t on t.id = d.tenant_id
    where ((d.status = 'pending' and d.next_attempt_at <= clock_timestamp())
      or (d.status = 'processing' and d.lease_until < clock_timestamp()))
      and public.tenant_can_write(t.id)
    order by d.next_attempt_at, d.invoice_id for update of d skip locked limit 1;
  if target is null then return; end if;
  return query update public.contract_invoice_deliveries set status = 'processing',
    attempts = attempts + 1, first_attempt_at = coalesce(first_attempt_at, clock_timestamp()),
    lease_token = gen_random_uuid(), lease_until = clock_timestamp() + interval '3 minutes',
    sender_address = coalesce(sender_address, p_sender_address)
    where invoice_id = target returning *;
end;
$$;
revoke all on function public.claim_contract_invoice_delivery(text) from public, anon, authenticated;
grant execute on function public.claim_contract_invoice_delivery(text) to service_role;

create function public.finish_contract_invoice_delivery(
  p_invoice_id uuid, p_lease_token uuid, p_outcome text,
  p_provider_email_id text default null, p_error_code text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.contract_invoice_deliveries%rowtype; final_status text;
begin
  if p_outcome is null or p_outcome not in ('sent', 'retry', 'failed')
     or (p_outcome = 'sent' and nullif(trim(p_provider_email_id), '') is null)
     or (p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,80}$') then
    raise exception 'Resultado de entrega inválido' using errcode = '22023';
  end if;
  select * into target from public.contract_invoice_deliveries
    where invoice_id = p_invoice_id and lease_token = p_lease_token and status = 'processing' for update;
  if not found then return false; end if;
  final_status := case when p_outcome = 'retry' then
    case when target.attempts < 8 and target.first_attempt_at > clock_timestamp() - interval '20 hours'
      then 'pending' else 'failed' end else p_outcome end;
  if p_outcome = 'sent' then
    insert into public.invoice_delivery_events(tenant_id, invoice_id, event_type, recipient_email, resend_email_id)
    values (target.tenant_id, target.invoice_id, 'accepted',
      target.payload #>> '{invoice,document_snapshot,client,email}', p_provider_email_id)
    on conflict (resend_email_id) do nothing;
  end if;
  update public.contract_invoice_deliveries set status = final_status,
    provider_email_id = coalesce(p_provider_email_id, provider_email_id), last_error = p_error_code,
    next_attempt_at = clock_timestamp() + interval '5 minutes' * least(12, power(2, target.attempts - 1)),
    lease_token = null, lease_until = null where invoice_id = target.invoice_id;
  if final_status in ('sent', 'failed') then
    update public.contract_invoice_notifications set read_at = null where invoice_id = target.invoice_id;
  end if;
  return true;
end;
$$;
revoke all on function public.finish_contract_invoice_delivery(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finish_contract_invoice_delivery(uuid, uuid, text, text, text) to service_role;

create function public.list_contract_invoice_notifications(p_tenant_id uuid)
returns table(id uuid, invoice_id uuid, invoice_number text, concept text, delivery_status text,
  error_code text, created_at timestamptz, read_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select n.id, n.invoice_id, i.number, i.concept, d.status, d.last_error, n.created_at, n.read_at
  from public.contract_invoice_notifications n
  join public.invoices i on i.id = n.invoice_id and i.tenant_id = n.tenant_id
  join public.contract_invoice_deliveries d on d.invoice_id = n.invoice_id and d.tenant_id = n.tenant_id
  where n.tenant_id = p_tenant_id and n.recipient_id = (select auth.uid())
    and public.has_role(p_tenant_id, array['owner', 'admin']::public.app_role[])
  order by (n.read_at is null) desc, n.created_at desc limit 30;
$$;
revoke all on function public.list_contract_invoice_notifications(uuid) from public, anon;
grant execute on function public.list_contract_invoice_notifications(uuid) to authenticated;

create function public.read_contract_invoice_notification(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.contract_invoice_notifications set read_at = coalesce(read_at, clock_timestamp())
    where id = p_id and recipient_id = (select auth.uid())
      and public.has_role(tenant_id, array['owner', 'admin']::public.app_role[]);
  if not found then raise exception 'Aviso no disponible' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.read_contract_invoice_notification(uuid) from public, anon;
grant execute on function public.read_contract_invoice_notification(uuid) to authenticated;

-- Keep the scheduler credential in Vault; it never passes through migrations or client code.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'contract_invoice_cron_secret') then
    perform vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'contract_invoice_cron_secret');
  end if;
end $$;
create function public.authorize_contract_invoice_worker(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_secret is not null and length(p_secret) between 32 and 256 and exists (
    select 1 from vault.decrypted_secrets where name = 'contract_invoice_cron_secret'
      and extensions.digest(decrypted_secret, 'sha256') = extensions.digest(p_secret, 'sha256')
  );
$$;
revoke all on function public.authorize_contract_invoice_worker(text) from public, anon, authenticated;
grant execute on function public.authorize_contract_invoice_worker(text) to service_role;

create function public.run_contract_invoice_email_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets
    where name = 'contract_invoice_cron_secret' limit 1;
  if secret is null then raise warning 'Contract invoice worker is not configured'; return; end if;
  perform net.http_post(
    url := 'https://vqyicgarlksirpzrngut.supabase.co/functions/v1/contract-invoice-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end;
$$;
revoke all on function public.run_contract_invoice_email_worker() from public, anon, authenticated, service_role;
select cron.schedule('contract-invoice-issuance', '15 6 * * *', 'select public.run_contract_invoice_automation()');
select cron.schedule('contract-invoice-email-worker', '*/5 * * * *', 'select public.run_contract_invoice_email_worker()');
