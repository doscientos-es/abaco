-- Daily preparation stops at reviewable drafts. It never consumes an invoice
-- number and never sends or charges a customer.
create table public.contract_billing_job_errors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contract_id uuid not null,
  error_code text not null,
  message text not null check (char_length(message) between 1 and 500),
  first_seen_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  occurrences integer not null default 1 check (occurrences > 0),
  resolved_at timestamptz,
  unique (contract_id, error_code, message),
  foreign key (contract_id, tenant_id)
    references public.service_contracts(id, tenant_id) on delete restrict
);
create index contract_billing_job_errors_open_idx
  on public.contract_billing_job_errors(tenant_id, contract_id, last_seen_at desc)
  where resolved_at is null;
alter table public.contract_billing_job_errors enable row level security;
revoke all on public.contract_billing_job_errors from public, anon, authenticated;
grant select on public.contract_billing_job_errors to authenticated, service_role;
create policy contract_billing_job_errors_office_read
  on public.contract_billing_job_errors for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin']::public.app_role[])
  );

create function public.run_contract_billing_generation() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  contract_row public.service_contracts%rowtype;
  new_periods integer;
  new_drafts integer;
  total_periods integer := 0;
  total_drafts integer := 0;
  total_errors integer := 0;
  failure_code text;
  failure_message text;
begin
  for contract_row in
    select * from public.service_contracts c
    where c.status <> 'draft' and c.starts_on <= current_date
      and public.tenant_can_write(c.tenant_id)
    order by c.tenant_id, c.id
  loop
    begin
      new_periods := app_private.generate_contract_billing_periods(
        contract_row.tenant_id, contract_row.id,
        (clock_timestamp() at time zone contract_row.timezone)::date
      );
      insert into public.invoice_contract_period_drafts (
        tenant_id, contract_period_id, contract_id, client_id,
        concept, total_cents, vat_rate, due_date
      )
      select p.tenant_id, p.id, p.contract_id, contract_row.client_id,
        left(contract_row.title || ' · ' || p.period_start_on::text ||
          ' a ' || p.period_end_on::text, 200),
        (coalesce(p.net_cents, v.net_cents) +
          round(coalesce(p.net_cents, v.net_cents) * p.vat_rate / 100))::bigint,
        p.vat_rate, (clock_timestamp() at time zone contract_row.timezone)::date + 15
      from public.contract_billing_periods p
      left join public.contract_billing_period_valuations v
        on v.period_id = p.id and v.tenant_id = p.tenant_id
      where p.tenant_id = contract_row.tenant_id
        and p.contract_id = contract_row.id
        and p.period_end_on <= (clock_timestamp() at time zone contract_row.timezone)::date
        and coalesce(p.net_cents, v.net_cents) > 0
        and coalesce(p.net_cents, v.net_cents) +
          round(coalesce(p.net_cents, v.net_cents) * p.vat_rate / 100)
          <= 9000000000000000
        and not exists (
          select 1 from public.invoices i where i.contract_period_id = p.id
        )
      on conflict (contract_period_id) do nothing;
      get diagnostics new_drafts = row_count;
      total_periods := total_periods + new_periods;
      total_drafts := total_drafts + new_drafts;
      update public.contract_billing_job_errors
        set resolved_at = clock_timestamp()
        where tenant_id = contract_row.tenant_id
          and contract_id = contract_row.id and resolved_at is null;
    exception when others then
      failure_code := sqlstate;
      failure_message := left(sqlerrm, 500);
      total_errors := total_errors + 1;
      insert into public.contract_billing_job_errors (
        tenant_id, contract_id, error_code, message
      ) values (
        contract_row.tenant_id, contract_row.id, failure_code, failure_message
      ) on conflict (contract_id, error_code, message) do update
        set last_seen_at = clock_timestamp(),
          occurrences = public.contract_billing_job_errors.occurrences + 1,
          resolved_at = null;
    end;
  end loop;
  return jsonb_build_object(
    'periods', total_periods, 'drafts', total_drafts, 'errors', total_errors
  );
end;
$$;
revoke all on function public.run_contract_billing_generation()
  from public, anon, authenticated, service_role;

select cron.unschedule('contract-billing-drafts')
  where exists (select 1 from cron.job where jobname = 'contract-billing-drafts');
select cron.schedule(
  'contract-billing-drafts', '30 5 * * *',
  'select public.run_contract_billing_generation()'
);
