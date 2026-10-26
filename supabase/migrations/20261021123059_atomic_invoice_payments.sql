-- Every manual invoice payment is one transaction: balance, ledger entry and idempotency record.
alter table public.invoices alter column paid_cents type bigint;
alter table public.invoices add constraint invoices_id_tenant_unique unique (id, tenant_id);

create table public.invoice_payment_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid not null,
  operation_id uuid not null unique,
  amount_cents bigint not null check (amount_cents > 0),
  payment_date date not null,
  ledger_entry_id uuid not null unique references public.ledger_entries (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, tenant_id) references public.invoices (id, tenant_id) on delete restrict
);

create index invoice_payment_operations_invoice_idx
  on public.invoice_payment_operations (tenant_id, invoice_id, created_at);

alter table public.invoice_payment_operations enable row level security;
create policy invoice_payment_operations_select on public.invoice_payment_operations
  for select to authenticated
  using (public.has_role(tenant_id, array['owner', 'admin']::public.app_role[]));

revoke all on public.invoice_payment_operations from public, anon, authenticated;
grant select on public.invoice_payment_operations to authenticated;

-- Ordinary browser updates cannot mark a document paid or alter its balance directly.
drop policy if exists invoices_update on public.invoices;

create function public.record_invoice_payment(
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
    'Cobro de presupuesto', p_amount_cents,
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

revoke all on function public.record_invoice_payment(uuid, bigint, date, uuid)
  from public, anon, authenticated;
grant execute on function public.record_invoice_payment(uuid, bigint, date, uuid)
  to authenticated;
