-- Keep legacy entries unchanged; a breakdown records the actual invoice bases and VAT.
create function public.valid_ledger_vat_breakdown(p_lines jsonb, p_gross bigint)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  rate numeric;
  base numeric;
  vat numeric;
  total numeric := 0;
begin
  if p_lines is null then return true; end if;
  if jsonb_typeof(p_lines) <> 'array' then return false; end if;
  if jsonb_array_length(p_lines) not between 1 and 20 then return false; end if;
  for item in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(item) <> 'object' or not (item ?& array['rate', 'baseCents', 'vatCents'])
       or item - array['rate', 'baseCents', 'vatCents'] <> '{}'::jsonb
       or jsonb_typeof(item->'rate') <> 'number'
       or jsonb_typeof(item->'baseCents') <> 'number'
       or jsonb_typeof(item->'vatCents') <> 'number' then return false; end if;
    rate := (item->>'rate')::numeric;
    base := (item->>'baseCents')::numeric;
    vat := (item->>'vatCents')::numeric;
    if rate not between 0 and 100 or rate <> round(rate, 2)
       or base not between 0 and 99999999999 or base <> trunc(base)
       or vat not between 0 and 99999999999 or vat <> trunc(vat) then return false; end if;
    total := total + base + vat;
  end loop;
  return total = abs(p_gross::numeric);
end;
$$;
revoke all on function public.valid_ledger_vat_breakdown(jsonb, bigint) from public, anon;
grant execute on function public.valid_ledger_vat_breakdown(jsonb, bigint) to authenticated, service_role;

alter table public.ledger_entries
  add column counterparty_name text check (char_length(counterparty_name) <= 200),
  add column counterparty_tax_id text check (char_length(counterparty_tax_id) <= 40),
  add column document_number text check (char_length(document_number) <= 100),
  add column vat_breakdown jsonb,
  add constraint ledger_vat_breakdown_valid check (public.valid_ledger_vat_breakdown(vat_breakdown, amount_cents));

-- Partial allocations use the actual total base, apportioned across the gross total.
-- The final allocation gets the remaining cents, avoiding cumulative rounding loss.
create or replace function public.allocate_ledger_expense(
  p_tenant_id uuid, p_ledger_entry_id uuid, p_work_order_id uuid,
  p_contract_id uuid, p_gross_cents bigint, p_work_cost_entry_id uuid,
  p_contract_cost_entry_id uuid, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  expense public.ledger_entries%rowtype;
  prior public.ledger_expense_allocations%rowtype;
  cost_cents bigint;
  allocated_cents bigint;
  allocated_net_cents bigint;
  total_net_cents bigint;
  line_net_cents bigint;
  allocation_id uuid;
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then raise exception 'Sin permiso para imputar gastos' using errcode = '42501'; end if;
  if p_operation_id is null or p_ledger_entry_id is null or p_gross_cents is null
     or p_gross_cents <= 0 or ((p_work_order_id is not null) = (p_contract_id is not null))
     or (p_work_order_id is null and p_work_cost_entry_id is not null)
     or (p_contract_id is null and p_contract_cost_entry_id is not null) then
    raise exception 'Imputación inválida' using errcode = '22023';
  end if;
  select * into expense from public.ledger_entries
  where id = p_ledger_entry_id and tenant_id = p_tenant_id for update;
  if not found or expense.kind <> 'expense' then
    raise exception 'Gasto no encontrado' using errcode = 'P0002';
  end if;
  select * into prior from public.ledger_expense_allocations where operation_id = p_operation_id;
  if found then
    if prior.tenant_id <> p_tenant_id or prior.ledger_entry_id <> p_ledger_entry_id
       or prior.work_order_id is distinct from p_work_order_id
       or prior.contract_id is distinct from p_contract_id
       or prior.gross_cents <> p_gross_cents
       or prior.work_cost_entry_id is distinct from p_work_cost_entry_id
       or prior.contract_cost_entry_id is distinct from p_contract_cost_entry_id
       or prior.reversal_of is not null then
      raise exception 'Clave de operación reutilizada' using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede imputar gastos' using errcode = 'P0402';
  end if;
  if p_work_order_id is not null and not exists (
    select 1 from public.work_orders where id = p_work_order_id and tenant_id = p_tenant_id
  ) then raise exception 'Trabajo no encontrado' using errcode = 'P0002'; end if;
  if p_contract_id is not null and not exists (
    select 1 from public.service_contracts where id = p_contract_id and tenant_id = p_tenant_id
  ) then raise exception 'Contrato no encontrado' using errcode = 'P0002'; end if;
  select coalesce(sum(gross_cents), 0)::bigint, coalesce(sum(net_cents), 0)::bigint
  into allocated_cents, allocated_net_cents from public.ledger_expense_allocations
  where ledger_entry_id = p_ledger_entry_id;
  if p_gross_cents > expense.amount_cents - allocated_cents then
    raise exception 'La imputación supera el saldo del gasto' using errcode = '22003';
  end if;
  if expense.vat_breakdown is null then
    total_net_cents := round(expense.amount_cents * 100 / (100 + expense.vat_rate))::bigint;
    line_net_cents := least(round(p_gross_cents * 100 / (100 + expense.vat_rate))::bigint,
      total_net_cents - allocated_net_cents);
  else
    select sum((line->>'baseCents')::bigint) into total_net_cents
    from jsonb_array_elements(expense.vat_breakdown) line;
    if p_gross_cents = expense.amount_cents - allocated_cents then
      line_net_cents := total_net_cents - allocated_net_cents;
    else
      line_net_cents := least(round(p_gross_cents::numeric * total_net_cents / expense.amount_cents)::bigint,
        total_net_cents - allocated_net_cents);
    end if;
  end if;
  if line_net_cents <= 0 then
    raise exception 'El importe neto debe ser positivo' using errcode = '22023';
  end if;
  if p_work_cost_entry_id is not null then
    select signed_total_cost_cents into cost_cents from public.work_cost_entries
    where id = p_work_cost_entry_id and tenant_id = p_tenant_id
      and work_order_id = p_work_order_id and reversal_of is null for update;
    if not found or cost_cents <> line_net_cents or exists (
      select 1 from public.work_cost_entries where reversal_of = p_work_cost_entry_id
    ) or exists (
      select 1 from public.ledger_expense_allocations a
      where a.work_cost_entry_id = p_work_cost_entry_id and a.reversal_of is null
        and not exists (select 1 from public.ledger_expense_allocations r where r.reversal_of = a.id)
    ) then raise exception 'Coste operativo incompatible o ya vinculado' using errcode = '22023'; end if;
  end if;
  if p_contract_cost_entry_id is not null then
    select signed_total_cost_cents into cost_cents from public.contract_cost_entries
    where id = p_contract_cost_entry_id and tenant_id = p_tenant_id
      and contract_id = p_contract_id and reversal_of is null for update;
    if not found or cost_cents <> line_net_cents or exists (
      select 1 from public.contract_cost_entries where reversal_of = p_contract_cost_entry_id
    ) or exists (
      select 1 from public.ledger_expense_allocations a
      where a.contract_cost_entry_id = p_contract_cost_entry_id and a.reversal_of is null
        and not exists (select 1 from public.ledger_expense_allocations r where r.reversal_of = a.id)
    ) then raise exception 'Coste operativo incompatible o ya vinculado' using errcode = '22023'; end if;
  end if;
  insert into public.ledger_expense_allocations (
    tenant_id, ledger_entry_id, work_order_id, contract_id, work_cost_entry_id,
    contract_cost_entry_id, gross_cents, net_cents, operation_id
  ) values (
    p_tenant_id, p_ledger_entry_id, p_work_order_id, p_contract_id,
    p_work_cost_entry_id, p_contract_cost_entry_id, p_gross_cents, line_net_cents, p_operation_id
  ) returning id into allocation_id;
  return allocation_id;
end;
$$;