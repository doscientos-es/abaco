-- A reviewed period receives a single valuation. Its original cycle and VAT
-- remain immutable; the valuation is append-only evidence from the office.
create table public.contract_billing_period_valuations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  period_id uuid not null unique,
  net_cents bigint not null check (net_cents between 0 and 9000000000000000),
  reason text not null check (char_length(reason) between 1 and 2000),
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (period_id, tenant_id)
    references public.contract_billing_periods(id, tenant_id) on delete restrict
);
create trigger contract_billing_period_valuations_immutable
  before update or delete on public.contract_billing_period_valuations
  for each row execute function public.reject_work_history_change();
alter table public.contract_billing_period_valuations enable row level security;
revoke all on public.contract_billing_period_valuations from public, anon, authenticated;
grant select on public.contract_billing_period_valuations to authenticated, service_role;
create policy contract_billing_period_valuations_office_read
  on public.contract_billing_period_valuations for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );

create function public.value_contract_billing_period(
  p_tenant_id uuid, p_period_id uuid, p_net_cents bigint, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.contract_billing_periods%rowtype;
declare contract_price bigint;
declare existing public.contract_billing_period_valuations%rowtype;
declare created_id uuid;
declare clean_reason text := trim(p_reason);
begin
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
      array['owner', 'admin']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para valorar periodos' using errcode = '42501';
  end if;
  if p_period_id is null or p_net_cents is null or p_net_cents < 0
     or clean_reason is null or char_length(clean_reason) not between 1 and 2000 then
    raise exception 'Valoración inválida' using errcode = '22023';
  end if;
  select * into target from public.contract_billing_periods
    where id = p_period_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Periodo no encontrado' using errcode = 'P0002'; end if;
  if target.pricing_status <> 'requires_review' then
    raise exception 'Este periodo ya tiene un precio contractual' using errcode = 'P0409';
  end if;
  select price_cents into contract_price from public.service_contracts
    where id = target.contract_id and tenant_id = p_tenant_id;
  if p_net_cents > contract_price
     or p_net_cents + round(p_net_cents * target.vat_rate / 100) > 9000000000000000 then
    raise exception 'El importe supera la cuota pactada o el límite monetario'
      using errcode = '22003';
  end if;
  select * into existing from public.contract_billing_period_valuations
    where period_id = p_period_id;
  if found then
    if existing.net_cents <> p_net_cents or existing.reason <> clean_reason then
      raise exception 'El periodo ya fue valorado con otros datos' using errcode = '23505';
    end if;
    return existing.id;
  end if;
  insert into public.contract_billing_period_valuations (
    tenant_id, period_id, net_cents, reason, actor_id
  ) values (
    p_tenant_id, p_period_id, p_net_cents, clean_reason, (select auth.uid())
  ) returning id into created_id;
  return created_id;
end;
$$;
revoke all on function public.value_contract_billing_period(uuid, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.value_contract_billing_period(uuid, uuid, bigint, text)
  to authenticated;

-- Add a third mutually exclusive invoice origin before any contract invoice exists.
alter table public.invoices
  add column contract_period_id uuid,
  add constraint invoices_contract_period_tenant_fk
    foreign key (contract_period_id, tenant_id)
    references public.contract_billing_periods(id, tenant_id) on delete restrict;
alter table public.invoices drop constraint invoices_one_origin;
alter table public.invoices add constraint invoices_one_origin check (
  (estimate_id is not null and milestone_id is not null
    and work_extra_id is null and contract_period_id is null)
  or (estimate_id is null and milestone_id is null
    and work_extra_id is not null and contract_period_id is null)
  or (estimate_id is null and milestone_id is null
    and work_extra_id is null and contract_period_id is not null)
);
create unique index invoices_one_per_contract_period_idx
  on public.invoices(contract_period_id) where contract_period_id is not null;

create function public.validate_invoice_contract_period() returns trigger
language plpgsql set search_path = '' as $$
declare target public.contract_billing_periods%rowtype;
declare valuation public.contract_billing_period_valuations%rowtype;
declare contract_client_id uuid;
declare expected_net bigint;
begin
  if new.contract_period_id is null then return new; end if;
  select * into target from public.contract_billing_periods
    where id = new.contract_period_id and tenant_id = new.tenant_id;
  if not found then raise exception 'Periodo contractual no encontrado' using errcode = 'P0002'; end if;
  select client_id into contract_client_id from public.service_contracts
    where id = target.contract_id and tenant_id = target.tenant_id;
  if target.pricing_status = 'priced' then
    expected_net := target.net_cents;
  else
    select * into valuation from public.contract_billing_period_valuations
      where period_id = target.id and tenant_id = target.tenant_id;
    expected_net := valuation.net_cents;
  end if;
  if expected_net is null or expected_net <= 0
     or contract_client_id is distinct from new.client_id
     or target.vat_rate <> new.vat_rate
     or expected_net + round(expected_net * target.vat_rate / 100)
       <> new.total_cents then
    raise exception 'La factura no coincide con el periodo valorado'
      using errcode = 'P0409';
  end if;
  return new;
end;
$$;
create trigger invoices_00_validate_contract_period
  before insert on public.invoices
  for each row execute function public.validate_invoice_contract_period();
revoke all on function public.validate_invoice_contract_period()
  from public, anon, authenticated;

create or replace function public.invoice_document_snapshot(
  p_invoice public.invoices, p_source text
) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'source', p_source, 'capturedAt', now(),
    'issuer', jsonb_build_object(
      'name', t.name, 'legalName', t.legal_name, 'taxId', t.tax_id,
      'email', t.email, 'phone', t.phone, 'address', t.address,
      'postalCode', t.postal_code, 'city', t.city, 'website', t.website,
      'iban', t.iban, 'brandColor', t.brand_color, 'logoUrl', t.logo_url,
      'documentFooter', t.document_footer
    ),
    'client', jsonb_build_object(
      'name', c.name, 'taxId', c.tax_id, 'address', c.address, 'email', c.email
    ),
    'estimateNumber', e.number,
    'workTitle', w.title,
    'extraDescription', x.description,
    'extraApproval', case when d.id is null then null else jsonb_build_object(
      'decisionId', d.id, 'mode', d.evidence_mode,
      'customerName', d.customer_name, 'decidedAt', d.decided_at
    ) end,
    'contractTitle', sc.title,
    'contractPeriodStart', cp.period_start_on,
    'contractPeriodEnd', cp.period_end_on
  )
  from public.tenants t
  join public.clients c on c.id = p_invoice.client_id and c.tenant_id = p_invoice.tenant_id
  left join public.contract_billing_periods cp
    on cp.id = p_invoice.contract_period_id and cp.tenant_id = p_invoice.tenant_id
  left join public.service_contracts sc
    on sc.id = cp.contract_id and sc.tenant_id = p_invoice.tenant_id
  left join public.estimates e
    on e.id = coalesce(p_invoice.estimate_id, sc.origin_estimate_id)
      and e.tenant_id = p_invoice.tenant_id
  left join public.work_order_extras x
    on x.id = p_invoice.work_extra_id and x.tenant_id = p_invoice.tenant_id
  left join public.work_orders w
    on w.id = x.work_order_id and w.tenant_id = p_invoice.tenant_id
  left join public.work_extra_decisions d
    on d.extra_id = x.id and d.tenant_id = p_invoice.tenant_id
  where t.id = p_invoice.tenant_id;
$$;

create or replace function public.protect_issued_invoice() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las facturas emitidas no se eliminan; emite una rectificativa';
  end if;
  if row(
    new.id, new.tenant_id, new.number, new.estimate_id, new.milestone_id,
    new.work_extra_id, new.contract_period_id, new.issue_operation_id,
    new.client_id, new.concept, new.total_cents, new.vat_rate,
    new.issued_at, new.due_date, new.created_at, new.document_snapshot
  ) is distinct from row(
    old.id, old.tenant_id, old.number, old.estimate_id, old.milestone_id,
    old.work_extra_id, old.contract_period_id, old.issue_operation_id,
    old.client_id, old.concept, old.total_cents, old.vat_rate,
    old.issued_at, old.due_date, old.created_at, old.document_snapshot
  ) then
    raise exception 'El contenido de una factura emitida es inmutable';
  end if;
  return new;
end;
$$;

create table public.invoice_contract_period_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contract_period_id uuid not null unique,
  contract_id uuid not null,
  client_id uuid not null,
  concept text not null check (char_length(concept) between 1 and 200),
  total_cents bigint not null check (total_cents > 0),
  vat_rate numeric(5, 2) not null check (vat_rate between 0 and 100),
  due_date date not null,
  status text not null default 'draft' check (status in ('draft', 'issued')),
  revision integer not null default 1 check (revision > 0),
  issued_invoice_id uuid unique references public.invoices(id) on delete restrict,
  issue_operation_id uuid unique,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (contract_period_id, tenant_id)
    references public.contract_billing_periods(id, tenant_id) on delete restrict,
  foreign key (contract_id, tenant_id)
    references public.service_contracts(id, tenant_id) on delete restrict,
  foreign key (client_id, tenant_id)
    references public.clients(id, tenant_id) on delete restrict,
  check ((status = 'draft' and issued_invoice_id is null and issue_operation_id is null)
    or (status = 'issued' and issued_invoice_id is not null
      and issue_operation_id is not null))
);
create index invoice_contract_period_drafts_open_idx
  on public.invoice_contract_period_drafts(tenant_id, created_at desc)
  where status = 'draft';
alter table public.invoice_contract_period_drafts enable row level security;
revoke all on public.invoice_contract_period_drafts from public, anon, authenticated;
grant select on public.invoice_contract_period_drafts to authenticated;
create policy invoice_contract_period_drafts_office_read
  on public.invoice_contract_period_drafts for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin', 'editor']::public.app_role[])
  );

create function public.create_invoice_contract_period_draft(
  p_tenant_id uuid, p_period_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare period_row public.contract_billing_periods%rowtype;
declare target public.service_contracts%rowtype;
declare valuation public.contract_billing_period_valuations%rowtype;
declare net_amount bigint;
declare gross_amount numeric;
declare draft_id uuid;
begin
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
      array['owner', 'admin']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para preparar facturas' using errcode = '42501';
  end if;
  select * into period_row from public.contract_billing_periods
    where id = p_period_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Periodo no encontrado' using errcode = 'P0002'; end if;
  select * into target from public.service_contracts
    where id = period_row.contract_id and tenant_id = p_tenant_id;
  if period_row.pricing_status = 'priced' then net_amount := period_row.net_cents;
  else
    select * into valuation from public.contract_billing_period_valuations
      where period_id = p_period_id and tenant_id = p_tenant_id;
    net_amount := valuation.net_cents;
  end if;
  if net_amount is null or net_amount <= 0 then
    raise exception 'Valora el periodo antes de preparar la factura'
      using errcode = 'P0410';
  end if;
  gross_amount := net_amount + round(net_amount * period_row.vat_rate / 100);
  if gross_amount > 9000000000000000 then
    raise exception 'Importe de factura fuera de rango' using errcode = '22003';
  end if;
  select id into draft_id from public.invoice_contract_period_drafts
    where contract_period_id = p_period_id and status = 'draft';
  if found then return draft_id; end if;
  if exists (select 1 from public.invoices where contract_period_id = p_period_id) then
    raise exception 'Este periodo ya se facturó' using errcode = 'P0409';
  end if;
  insert into public.invoice_contract_period_drafts (
    tenant_id, contract_period_id, contract_id, client_id, concept,
    total_cents, vat_rate, due_date
  ) values (
    p_tenant_id, p_period_id, target.id, target.client_id,
    left(target.title || ' · ' || period_row.period_start_on::text ||
      ' a ' || period_row.period_end_on::text, 200),
    gross_amount::bigint, period_row.vat_rate, current_date + 15
  ) on conflict (contract_period_id) do nothing returning id into draft_id;
  if draft_id is null then
    select id into draft_id from public.invoice_contract_period_drafts
      where contract_period_id = p_period_id and status = 'draft';
  end if;
  if draft_id is null then
    raise exception 'Este periodo ya se facturó' using errcode = 'P0409';
  end if;
  return draft_id;
end;
$$;
revoke all on function public.create_invoice_contract_period_draft(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_invoice_contract_period_draft(uuid, uuid)
  to authenticated;

create function public.update_invoice_contract_period_draft(
  p_tenant_id uuid, p_draft_id uuid, p_expected_revision integer,
  p_concept text, p_due_date date
) returns integer language plpgsql security definer set search_path = '' as $$
declare new_revision integer;
begin
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
      array['owner', 'admin']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para editar facturas' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 1
     or p_concept is null or char_length(trim(p_concept)) not between 1 and 200
     or p_due_date is null then
    raise exception 'Datos del borrador inválidos' using errcode = '22023';
  end if;
  update public.invoice_contract_period_drafts
    set concept = trim(p_concept), due_date = p_due_date,
      revision = revision + 1, updated_at = clock_timestamp()
    where id = p_draft_id and tenant_id = p_tenant_id
      and status = 'draft' and revision = p_expected_revision
    returning revision into new_revision;
  if not found then
    raise exception 'El borrador cambió o ya se emitió; recarga antes de guardar'
      using errcode = 'P0409';
  end if;
  return new_revision;
end;
$$;
revoke all on function public.update_invoice_contract_period_draft(
  uuid, uuid, integer, text, date) from public, anon, authenticated;
grant execute on function public.update_invoice_contract_period_draft(
  uuid, uuid, integer, text, date) to authenticated;

create function public.issue_invoice_contract_period_draft(
  p_tenant_id uuid, p_draft_id uuid, p_expected_revision integer,
  p_operation_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.invoice_contract_period_drafts%rowtype;
declare created_id uuid;
begin
  if (select auth.uid()) is null or not public.has_role(p_tenant_id,
      array['owner', 'admin']::public.app_role[])
     or not public.tenant_can_write(p_tenant_id) then
    raise exception 'No tienes permiso para emitir facturas' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 1
     or p_operation_id is null then
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
  if target.due_date < current_date then
    raise exception 'La fecha de vencimiento ya pasó' using errcode = '22023';
  end if;
  if exists (select 1 from public.invoices
    where contract_period_id = target.contract_period_id) then
    raise exception 'Este periodo ya se facturó' using errcode = 'P0409';
  end if;
  insert into public.invoices (
    tenant_id, contract_period_id, issue_operation_id, client_id,
    concept, total_cents, vat_rate, status, issued_at, due_date
  ) values (
    target.tenant_id, target.contract_period_id, p_operation_id,
    target.client_id, target.concept, target.total_cents, target.vat_rate,
    'issued', current_date, target.due_date
  ) returning id into created_id;
  update public.invoice_contract_period_drafts
    set status = 'issued', issued_invoice_id = created_id,
      issue_operation_id = p_operation_id, updated_at = clock_timestamp()
    where id = target.id;
  return created_id;
end;
$$;
revoke all on function public.issue_invoice_contract_period_draft(
  uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.issue_invoice_contract_period_draft(
  uuid, uuid, integer, uuid) to authenticated;
