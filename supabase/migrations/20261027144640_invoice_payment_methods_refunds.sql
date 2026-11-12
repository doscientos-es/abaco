-- A refund reverses cash received, not the issued invoice. Negative income is a
-- contra-receipt, never an input-tax expense.
alter table public.ledger_entries drop constraint ledger_entries_amount_cents_check;
alter table public.ledger_entries add constraint ledger_entries_amount_cents_check
  check (amount_cents <> 0 and (kind = 'income' or amount_cents > 0));

alter table public.invoice_payment_operations
  add column payment_method text not null default 'unspecified'
  check (payment_method in ('unspecified', 'transfer', 'cash', 'card', 'other'));
alter table public.invoice_payment_operations
  add constraint invoice_payment_operations_id_tenant_invoice_unique
  unique (id, tenant_id, invoice_id);
alter table public.ledger_entries
  add constraint ledger_entries_id_tenant_unique unique (id, tenant_id);

create table public.invoice_payment_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid not null,
  payment_id uuid not null,
  operation_id uuid not null unique,
  amount_cents bigint not null check (amount_cents > 0),
  refund_date date not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  ledger_entry_id uuid not null unique,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, tenant_id) references public.invoices(id, tenant_id) on delete restrict,
  foreign key (payment_id, tenant_id, invoice_id)
    references public.invoice_payment_operations(id, tenant_id, invoice_id) on delete restrict,
  foreign key (ledger_entry_id, tenant_id)
    references public.ledger_entries(id, tenant_id) on delete restrict
);
create index invoice_payment_refunds_payment_idx
  on public.invoice_payment_refunds(tenant_id, payment_id, created_at);
create trigger invoice_payment_refunds_immutable
  before update or delete on public.invoice_payment_refunds
  for each row execute function public.reject_work_history_change();
alter table public.invoice_payment_refunds enable row level security;
revoke all on public.invoice_payment_refunds from public, anon, authenticated;
grant select on public.invoice_payment_refunds to authenticated, service_role;
create policy invoice_payment_refunds_select on public.invoice_payment_refunds
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin']::public.app_role[])
  );

create function public.record_invoice_payment(
  p_invoice_id uuid, p_amount_cents bigint, p_payment_date date,
  p_operation_id uuid, p_payment_method text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
     or p_amount_cents is null or p_amount_cents <= 0
     or p_payment_method is null or p_payment_method not in
       ('unspecified', 'transfer', 'cash', 'card', 'other') then
    raise exception 'Datos de cobro inválidos' using errcode = '22023';
  end if;
  select * into target from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Factura no encontrada' using errcode = 'P0002'; end if;
  if not public.has_role(target.tenant_id, array['owner', 'admin']::public.app_role[]) then
    raise exception 'No tienes permiso para registrar cobros' using errcode = '42501';
  end if;
  select * into prior from public.invoice_payment_operations where operation_id = p_operation_id;
  if found then
    if prior.invoice_id <> p_invoice_id or prior.amount_cents <> p_amount_cents
       or prior.payment_date <> p_payment_date or prior.payment_method <> p_payment_method then
      raise exception 'La clave de operación ya se utilizó con otros datos' using errcode = '23505';
    end if;
    return jsonb_build_object('paymentId', prior.id, 'paidCents', target.paid_cents);
  end if;
  if not public.tenant_can_write(target.tenant_id) then
    raise exception 'La empresa no puede registrar nuevos cobros' using errcode = 'P0402';
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
    case when target.contract_period_id is not null then 'Cobro de contrato'
         when target.work_extra_id is not null then 'Cobro de trabajo'
         else 'Cobro de presupuesto' end,
    p_amount_cents, target.vat_rate, target.estimate_id, target.milestone_id
  );
  new_paid := target.paid_cents + p_amount_cents;
  update public.invoices set paid_cents = new_paid where id = target.id;
  insert into public.invoice_payment_operations (
    tenant_id, invoice_id, operation_id, amount_cents, payment_date,
    ledger_entry_id, payment_method
  ) values (
    target.tenant_id, target.id, p_operation_id, p_amount_cents, p_payment_date,
    ledger_id, p_payment_method
  ) returning id into payment_id;
  return jsonb_build_object('paymentId', payment_id, 'paidCents', new_paid);
end;
$$;
revoke all on function public.record_invoice_payment(uuid, bigint, date, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_invoice_payment(uuid, bigint, date, uuid, text)
  to authenticated;

-- Legacy callers retain a safe default while the UI starts sending the method.
create or replace function public.record_invoice_payment(
  p_invoice_id uuid, p_amount_cents bigint, p_payment_date date, p_operation_id uuid
) returns jsonb
language sql security definer set search_path = '' as $$
  select public.record_invoice_payment(
    p_invoice_id, p_amount_cents, p_payment_date, p_operation_id, 'unspecified'
  );
$$;
revoke all on function public.record_invoice_payment(uuid, bigint, date, uuid)
  from public, anon, authenticated;
grant execute on function public.record_invoice_payment(uuid, bigint, date, uuid)
  to authenticated;

create function public.refund_invoice_payment(
  p_payment_id uuid, p_amount_cents bigint, p_refund_date date,
  p_reason text, p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  payment public.invoice_payment_operations%rowtype;
  target public.invoices%rowtype;
  prior public.invoice_payment_refunds%rowtype;
  refunded_cents bigint;
  refund_id uuid;
  ledger_id uuid;
  new_paid bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión requerida' using errcode = '28000';
  end if;
  if p_payment_id is null or p_operation_id is null or p_refund_date is null
     or p_amount_cents is null or p_amount_cents <= 0 or p_reason is null
     or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'Datos de reembolso inválidos' using errcode = '22023';
  end if;
  select * into payment from public.invoice_payment_operations where id = p_payment_id;
  if not found then raise exception 'Cobro no encontrado' using errcode = 'P0002'; end if;
  select * into target from public.invoices where id = payment.invoice_id for update;
  if not found then raise exception 'Factura no encontrada' using errcode = 'P0002'; end if;
  if not public.has_role(target.tenant_id, array['owner', 'admin']::public.app_role[]) then
    raise exception 'No tienes permiso para reembolsar cobros' using errcode = '42501';
  end if;
  select * into prior from public.invoice_payment_refunds where operation_id = p_operation_id;
  if found then
    if prior.payment_id <> p_payment_id or prior.amount_cents <> p_amount_cents
       or prior.refund_date <> p_refund_date or prior.reason <> btrim(p_reason) then
      raise exception 'La clave de operación ya se utilizó con otros datos' using errcode = '23505';
    end if;
    return jsonb_build_object('refundId', prior.id, 'paidCents', target.paid_cents);
  end if;
  if not public.tenant_can_write(target.tenant_id) then
    raise exception 'La empresa no puede registrar reembolsos' using errcode = 'P0402';
  end if;
  select coalesce(sum(amount_cents), 0)::bigint into refunded_cents
  from public.invoice_payment_refunds where payment_id = p_payment_id;
  if p_amount_cents > payment.amount_cents - refunded_cents
     or p_amount_cents > target.paid_cents then
    raise exception 'El reembolso supera el cobro disponible' using errcode = '22003';
  end if;
  ledger_id := gen_random_uuid();
  insert into public.ledger_entries (
    id, tenant_id, kind, entry_date, concept, category, amount_cents,
    vat_rate, estimate_id, milestone_id
  ) values (
    ledger_id, target.tenant_id, 'income', p_refund_date,
    left(target.number || ' · reembolso · ' || target.concept, 200),
    'Reembolso de factura', -p_amount_cents,
    target.vat_rate, target.estimate_id, target.milestone_id
  );
  new_paid := target.paid_cents - p_amount_cents;
  update public.invoices set paid_cents = new_paid where id = target.id;
  insert into public.invoice_payment_refunds (
    tenant_id, invoice_id, payment_id, operation_id, amount_cents,
    refund_date, reason, ledger_entry_id
  ) values (
    target.tenant_id, target.id, payment.id, p_operation_id, p_amount_cents,
    p_refund_date, btrim(p_reason), ledger_id
  ) returning id into refund_id;
  return jsonb_build_object('refundId', refund_id, 'paidCents', new_paid);
end;
$$;
revoke all on function public.refund_invoice_payment(uuid, bigint, date, text, uuid)
  from public, anon, authenticated;
grant execute on function public.refund_invoice_payment(uuid, bigint, date, text, uuid)
  to authenticated;

create function public.protect_invoice_payment_ledger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.invoice_payment_operations where ledger_entry_id = old.id
  ) or exists (
    select 1 from public.invoice_payment_refunds where ledger_entry_id = old.id
  ) then
    raise exception 'El asiento de cobro o reembolso es inmutable' using errcode = '23503';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger invoice_payment_ledger_immutable
  before update or delete on public.ledger_entries
  for each row execute function public.protect_invoice_payment_ledger();
revoke all on function public.protect_invoice_payment_ledger()
  from public, anon, authenticated;
