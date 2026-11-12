-- One manually issued invoice can originate from an approved work extra.
-- Legacy milestone invoices retain their existing origin and numbering.
alter table public.work_order_extras
  add constraint work_order_extras_id_tenant_unique unique (id, tenant_id);
alter table public.invoices
  alter column estimate_id drop not null,
  alter column milestone_id drop not null,
  add column work_extra_id uuid,
  add column issue_operation_id uuid unique,
  add constraint invoices_one_origin check (
    (estimate_id is not null and milestone_id is not null and work_extra_id is null)
    or (estimate_id is null and milestone_id is null and work_extra_id is not null)
  ),
  add constraint invoices_work_extra_tenant_fk
    foreign key (work_extra_id, tenant_id)
    references public.work_order_extras (id, tenant_id) on delete restrict;
create unique index invoices_one_per_work_extra_idx
  on public.invoices (work_extra_id) where work_extra_id is not null;

create function public.validate_invoice_work_extra() returns trigger
language plpgsql set search_path = ''
as $$
declare
  extra public.work_order_extras%rowtype;
  target_client_id uuid;
  expected_total numeric;
begin
  if new.work_extra_id is null then return new; end if;
  select * into extra from public.work_order_extras x
  where x.id = new.work_extra_id and x.tenant_id = new.tenant_id;
  if not found or extra.status <> 'approved' or not exists (
    select 1 from public.work_extra_decisions d
    where d.extra_id = extra.id and d.tenant_id = extra.tenant_id
      and d.decision = 'approved'
  ) then
    raise exception 'Solo se puede facturar un extra aprobado con evidencia'
      using errcode = 'P0409';
  end if;
  select w.client_id into target_client_id from public.work_orders w
  where w.id = extra.work_order_id and w.tenant_id = extra.tenant_id;
  expected_total := extra.price_cents + round(extra.price_cents * extra.vat_rate / 100);
  if target_client_id is distinct from new.client_id
     or extra.vat_rate <> new.vat_rate
     or expected_total <> new.total_cents then
    raise exception 'La factura no coincide con el extra aprobado'
      using errcode = 'P0409';
  end if;
  return new;
end;
$$;
create trigger invoices_00_validate_extra
  before insert on public.invoices
  for each row execute function public.validate_invoice_work_extra();
revoke execute on function public.validate_invoice_work_extra()
  from public, anon, authenticated;

create or replace function public.invoice_document_snapshot(
  p_invoice public.invoices, p_source text
) returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'source', p_source,
    'capturedAt', now(),
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
    ) end
  )
  from public.tenants t
  join public.clients c on c.id = p_invoice.client_id and c.tenant_id = p_invoice.tenant_id
  left join public.estimates e on e.id = p_invoice.estimate_id
    and e.tenant_id = p_invoice.tenant_id
  left join public.work_order_extras x on x.id = p_invoice.work_extra_id
    and x.tenant_id = p_invoice.tenant_id
  left join public.work_orders w on w.id = x.work_order_id
    and w.tenant_id = p_invoice.tenant_id
  left join public.work_extra_decisions d on d.extra_id = x.id
    and d.tenant_id = p_invoice.tenant_id
  where t.id = p_invoice.tenant_id;
$$;

create or replace function public.protect_issued_invoice() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las facturas emitidas no se eliminan; emite una rectificativa';
  end if;
  if row(
    new.id, new.tenant_id, new.number, new.estimate_id, new.milestone_id,
    new.work_extra_id, new.issue_operation_id, new.client_id, new.concept,
    new.total_cents, new.vat_rate, new.issued_at, new.due_date,
    new.created_at, new.document_snapshot
  ) is distinct from row(
    old.id, old.tenant_id, old.number, old.estimate_id, old.milestone_id,
    old.work_extra_id, old.issue_operation_id, old.client_id, old.concept,
    old.total_cents, old.vat_rate, old.issued_at, old.due_date,
    old.created_at, old.document_snapshot
  ) then
    raise exception 'El contenido de una factura emitida es inmutable';
  end if;
  return new;
end;
$$;
create function public.issue_work_extra_invoice(
  p_tenant_id uuid, p_extra_id uuid, p_due_date date, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  extra public.work_order_extras%rowtype;
  prior public.invoices%rowtype;
  target_client_id uuid;
  created_id uuid;
  total_amount numeric;
begin
  if p_tenant_id is null or p_extra_id is null or p_due_date is null
     or p_operation_id is null or p_due_date < current_date then
    raise exception 'Datos de emisión inválidos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para emitir facturas' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );
  select * into prior from public.invoices where issue_operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.work_extra_id <> p_extra_id
       or prior.due_date <> p_due_date then
      raise exception 'La clave de operación ya se utilizó con otros datos'
        using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede emitir facturas' using errcode = 'P0402';
  end if;
  select * into extra from public.work_order_extras
  where id = p_extra_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Extra no encontrado' using errcode = 'P0002'; end if;
  if extra.status <> 'approved' then
    raise exception 'Solo se puede facturar un extra aprobado con evidencia'
      using errcode = 'P0409';
  end if;
  select * into prior from public.invoices
  where work_extra_id = extra.id;
  if found then
    if prior.due_date <> p_due_date then
      raise exception 'El extra ya se facturó con otra fecha de vencimiento'
        using errcode = 'P0409';
    end if;
    return prior.id;
  end if;
  select client_id into target_client_id from public.work_orders
  where id = extra.work_order_id and tenant_id = p_tenant_id;
  total_amount := extra.price_cents + round(extra.price_cents * extra.vat_rate / 100);
  if total_amount > 9000000000000000 then
    raise exception 'Importe de factura fuera de rango' using errcode = '22003';
  end if;
  insert into public.invoices (
    tenant_id, work_extra_id, issue_operation_id, client_id,
    concept, total_cents, vat_rate, status, issued_at, due_date
  ) values (
    p_tenant_id, extra.id, p_operation_id, target_client_id,
    left('Extra · ' || extra.description, 200), total_amount::bigint,
    extra.vat_rate, 'issued', current_date, p_due_date
  ) returning id into created_id;
  return created_id;
end;
$$;
revoke all on function public.issue_work_extra_invoice(uuid, uuid, date, uuid)
  from public, anon, authenticated;
grant execute on function public.issue_work_extra_invoice(uuid, uuid, date, uuid)
  to authenticated;

-- Preserve the invoice origin in the existing atomic payment ledger.
create or replace function public.record_invoice_payment(
  p_invoice_id uuid, p_amount_cents bigint, p_payment_date date, p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  target public.invoices%rowtype;
  prior public.invoice_payment_operations%rowtype;
  ledger_id uuid;
  payment_id uuid;
  new_paid bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  if p_invoice_id is null or p_operation_id is null or p_payment_date is null
     or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Datos de cobro inválidos' using errcode = '22023';
  end if;

  select * into target from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Factura no encontrada' using errcode = 'P0002'; end if;

  if not exists (
    select 1 from public.memberships m
    where m.tenant_id = target.tenant_id and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'No tienes permiso para registrar cobros' using errcode = '42501';
  end if;
  if not public.tenant_can_write(target.tenant_id) then
    raise exception 'La empresa no puede registrar nuevos cobros' using errcode = 'P0402';
  end if;

  select * into prior from public.invoice_payment_operations
  where operation_id = p_operation_id;
  if found then
    if prior.invoice_id <> p_invoice_id or prior.amount_cents <> p_amount_cents
       or prior.payment_date <> p_payment_date then
      raise exception 'La clave de operación ya se utilizó con otros datos' using errcode = '23505';
    end if;
    return jsonb_build_object('paymentId', prior.id, 'paidCents', target.paid_cents);
  end if;

  if p_amount_cents > target.total_cents - target.paid_cents then
    raise exception 'El cobro supera el saldo pendiente' using errcode = '22003';
  end if;

  ledger_id := gen_random_uuid();
  insert into public.ledger_entries (
    id, tenant_id, kind, entry_date, concept, category, amount_cents,
    vat_rate, estimate_id, milestone_id
  ) values (
    ledger_id, target.tenant_id, 'income', p_payment_date,
    left(target.number || ' · cobro · ' || target.concept, 200),
    case when target.work_extra_id is null then 'Cobro de presupuesto'
         else 'Cobro de trabajo' end, p_amount_cents,
    target.vat_rate, target.estimate_id, target.milestone_id
  );

  new_paid := target.paid_cents + p_amount_cents;
  update public.invoices
  set paid_cents = new_paid,
      status = case when new_paid = target.total_cents then 'paid' else target.status end
  where id = target.id;

  insert into public.invoice_payment_operations (
    tenant_id, invoice_id, operation_id, amount_cents, payment_date, ledger_entry_id
  ) values (
    target.tenant_id, target.id, p_operation_id, p_amount_cents, p_payment_date, ledger_id
  ) returning id into payment_id;

  return jsonb_build_object('paymentId', payment_id, 'paidCents', new_paid);
end;
$$;
