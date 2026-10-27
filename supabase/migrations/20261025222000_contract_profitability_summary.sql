-- Aggregate cost entries and invoices independently to avoid join multiplication.
-- Only issued invoices count as revenue; collected is always gross cash.
create function public.contract_profitability_summary(
  p_tenant_id uuid, p_contract_id uuid
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  target public.service_contracts%rowtype;
  cost_cents bigint;
  cost_count bigint;
  billed_net_cents bigint;
  billed_gross_cents bigint;
  collected_gross_cents bigint;
  invoice_count bigint;
begin
  if p_tenant_id is null or p_contract_id is null then
    raise exception 'Contrato y empresa requeridos' using errcode = '22023';
  end if;
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then
    raise exception 'No tienes permiso para consultar rentabilidad'
      using errcode = '42501';
  end if;
  select * into target from public.service_contracts
    where id = p_contract_id and tenant_id = p_tenant_id;
  if not found then raise exception 'Contrato no encontrado' using errcode = 'P0002'; end if;

  select coalesce(sum(signed_total_cost_cents), 0)::bigint
  into cost_cents from public.contract_cost_entries
  where tenant_id = p_tenant_id and contract_id = p_contract_id;
  select count(*) into cost_count from public.contract_cost_entries c
  where c.tenant_id = p_tenant_id and c.contract_id = p_contract_id
    and c.reversal_of is null and not exists (
      select 1 from public.contract_cost_entries r where r.reversal_of = c.id
    );
  select coalesce(sum(round(i.total_cents * 100 / (100 + i.vat_rate))), 0)::bigint,
    coalesce(sum(i.total_cents), 0)::bigint,
    coalesce(sum(i.paid_cents), 0)::bigint,
    count(*)
  into billed_net_cents, billed_gross_cents, collected_gross_cents, invoice_count
  from public.invoices i
  where i.tenant_id = p_tenant_id and (
    (target.origin_estimate_id is not null and i.estimate_id = target.origin_estimate_id)
    or exists (
      select 1 from public.contract_billing_periods p
      where p.id = i.contract_period_id and p.tenant_id = p_tenant_id
        and p.contract_id = p_contract_id
    )
  );
  return jsonb_build_object(
    'actualCostCents', cost_cents,
    'activeCostCount', cost_count,
    'billedNetCents', billed_net_cents,
    'billedGrossCents', billed_gross_cents,
    'collectedGrossCents', collected_gross_cents,
    'invoiceCount', invoice_count
  );
end;
$$;
revoke all on function public.contract_profitability_summary(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.contract_profitability_summary(uuid, uuid)
  to authenticated;

-- Payment category follows the immutable invoice origin.
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
    case when target.contract_period_id is not null then 'Cobro de contrato'
         when target.work_extra_id is not null then 'Cobro de trabajo'
         else 'Cobro de presupuesto' end, p_amount_cents,
    target.vat_rate, target.estimate_id, target.milestone_id
  );

  new_paid := target.paid_cents + p_amount_cents;
  update public.invoices
  set paid_cents = new_paid
  where id = target.id;

  insert into public.invoice_payment_operations (
    tenant_id, invoice_id, operation_id, amount_cents, payment_date, ledger_entry_id
  ) values (
    target.tenant_id, target.id, p_operation_id, p_amount_cents, p_payment_date, ledger_id
  ) returning id into payment_id;

  return jsonb_build_object('paymentId', payment_id, 'paidCents', new_paid);
end;
$$;
