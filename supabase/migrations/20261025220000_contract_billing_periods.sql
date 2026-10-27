-- Contract periods are obligations, not invoices. A unique cycle number makes
-- regeneration safe. Partial or paused cycles require office valuation.
create table public.contract_billing_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contract_id uuid not null,
  cycle_index integer not null check (cycle_index >= 0),
  period_start_on date not null,
  period_end_on date not null,
  net_cents bigint check (net_cents between 0 and 9000000000000000),
  vat_rate numeric(5, 2) not null check (vat_rate between 0 and 100),
  pricing_status text not null check (pricing_status in ('priced', 'requires_review')),
  review_reason text,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, tenant_id),
  unique (contract_id, cycle_index),
  foreign key (contract_id, tenant_id)
    references public.service_contracts(id, tenant_id) on delete restrict,
  check (period_end_on >= period_start_on),
  check (
    (pricing_status = 'priced' and net_cents is not null and review_reason is null)
    or (pricing_status = 'requires_review' and net_cents is null
      and review_reason is not null)
  )
);
create index contract_billing_periods_tenant_idx
  on public.contract_billing_periods(tenant_id, contract_id, period_start_on desc);
alter table public.contract_billing_periods enable row level security;
revoke all on public.contract_billing_periods from public, anon, authenticated;
grant select on public.contract_billing_periods to authenticated, service_role;
create policy contract_billing_periods_office_read
  on public.contract_billing_periods for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );
create trigger contract_billing_periods_immutable
  before update or delete on public.contract_billing_periods
  for each row execute function public.reject_work_history_change();

create function app_private.generate_contract_billing_periods(
  p_tenant_id uuid, p_contract_id uuid, p_through_on date
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  target public.service_contracts%rowtype;
  cycle_months integer;
  cycle_index integer := 0;
  cycle_start date;
  next_start date;
  cycle_end date;
  terminal_on date;
  source_vat_rate numeric(5, 2);
  status_at_start text;
  pause_in_cycle boolean;
  reason text;
  generated_count integer := 0;
  inserted_id uuid;
begin
  if p_tenant_id is null or p_contract_id is null or p_through_on is null
     or p_through_on > current_date + 31 then
    raise exception 'Intervalo de facturación inválido' using errcode = '22023';
  end if;
  select * into target from public.service_contracts
    where id = p_contract_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Contrato no encontrado' using errcode = 'P0002'; end if;
  if target.status = 'draft' then
    raise exception 'Activa el contrato antes de generar periodos' using errcode = 'P0409';
  end if;
  if target.price_cents <= 0 then
    raise exception 'El contrato no tiene precio facturable' using errcode = 'P0410';
  end if;
  cycle_months := case target.billing_frequency
    when 'monthly' then 1 when 'quarterly' then 3 else 12 end;
  source_vat_rate := case
    when target.origin_estimate_id is not null
      then (target.source_snapshot #>> '{estimate,vat_rate}')::numeric
    else (select default_vat_rate from public.tenants where id = p_tenant_id)
  end;
  if source_vat_rate is null or source_vat_rate not between 0 and 100 then
    raise exception 'IVA contractual no disponible' using errcode = 'P0410';
  end if;
  if target.price_cents + round(target.price_cents * source_vat_rate / 100)
      > 9000000000000000 then
    raise exception 'Importe de cuota fuera de rango' using errcode = '22003';
  end if;
  select min((e.occurred_at at time zone target.timezone)::date) into terminal_on
  from public.service_contract_events e
  where e.tenant_id = p_tenant_id and e.contract_id = p_contract_id
    and e.kind = 'status_changed'
    and e.payload->>'to' in ('expired', 'canceled');

  loop
    if cycle_index >= 1200 then
      raise exception 'El contrato excede el límite de periodos' using errcode = '22003';
    end if;
    cycle_start := (target.starts_on + pg_catalog.make_interval(
      months => cycle_index * cycle_months
    ))::date;
    exit when cycle_start > p_through_on
      or (target.ends_on is not null and cycle_start > target.ends_on)
      or (terminal_on is not null and cycle_start > terminal_on);
    next_start := (target.starts_on + pg_catalog.make_interval(
      months => (cycle_index + 1) * cycle_months
    ))::date;
    cycle_end := least(next_start - 1, coalesce(target.ends_on, next_start - 1),
      coalesce(terminal_on, next_start - 1));
    exit when cycle_end > p_through_on;

    -- Any interruption that intersects a cycle changes the obligation.
    select e.payload->>'to' into status_at_start
    from public.service_contract_events e
    where e.tenant_id = p_tenant_id and e.contract_id = p_contract_id
      and e.kind = 'status_changed'
      and (e.occurred_at at time zone target.timezone)::date <= cycle_start
    order by e.occurred_at desc, e.id desc limit 1;
    select exists (
      select 1 from public.service_contract_events e
      where e.tenant_id = p_tenant_id and e.contract_id = p_contract_id
        and e.kind = 'status_changed'
        and e.payload->>'to' in ('paused', 'expired', 'canceled')
        and (e.occurred_at at time zone target.timezone)::date
          between cycle_start and cycle_end
    ) into pause_in_cycle;
    reason := case
      when cycle_end < next_start - 1 then 'Periodo final parcial'
      when status_at_start is distinct from 'active'
        then 'Periodo anterior a la activación o afectado por una interrupción'
      when pause_in_cycle
        then 'Periodo afectado por una interrupción'
      else null end;
    insert into public.contract_billing_periods (
      tenant_id, contract_id, cycle_index, period_start_on, period_end_on,
      net_cents, vat_rate, pricing_status, review_reason
    ) values (
      p_tenant_id, p_contract_id, cycle_index, cycle_start, cycle_end,
      case when reason is null then target.price_cents else null end,
      source_vat_rate,
      case when reason is null then 'priced' else 'requires_review' end,
      reason
    ) on conflict (contract_id, cycle_index) do nothing returning id into inserted_id;
    if inserted_id is not null then generated_count := generated_count + 1; end if;
    inserted_id := null;
    cycle_index := cycle_index + 1;
  end loop;
  return generated_count;
end;
$$;
revoke all on function app_private.generate_contract_billing_periods(uuid, uuid, date)
  from public, anon, authenticated, service_role;

create function public.generate_contract_billing_periods(
  p_tenant_id uuid, p_contract_id uuid, p_through_on date
) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para generar periodos' using errcode = '42501';
  end if;
  return app_private.generate_contract_billing_periods(
    p_tenant_id, p_contract_id, p_through_on
  );
end;
$$;
revoke all on function public.generate_contract_billing_periods(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.generate_contract_billing_periods(uuid, uuid, date)
  to authenticated;
