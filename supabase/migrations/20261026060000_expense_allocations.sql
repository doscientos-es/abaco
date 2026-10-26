-- An expense can be split across jobs and contracts. Every allocation is an
-- immutable event; reversing it preserves the audit trail and releases capacity.
create table public.ledger_expense_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  ledger_entry_id uuid not null references public.ledger_entries (id) on delete restrict,
  work_order_id uuid references public.work_orders (id) on delete restrict,
  contract_id uuid references public.service_contracts (id) on delete restrict,
  work_cost_entry_id uuid references public.work_cost_entries (id) on delete restrict,
  contract_cost_entry_id uuid references public.contract_cost_entries (id) on delete restrict,
  gross_cents bigint not null check (gross_cents <> 0),
  net_cents bigint not null check (net_cents <> 0),
  reversal_of uuid unique references public.ledger_expense_allocations (id) on delete restrict,
  operation_id uuid not null unique,
  created_at timestamptz not null default now(),
  constraint expense_allocation_target check ((work_order_id is not null) <> (contract_id is not null)),
  constraint expense_allocation_cost_target check (
    (work_cost_entry_id is null or (work_order_id is not null and contract_cost_entry_id is null))
    and (contract_cost_entry_id is null or (contract_id is not null and work_cost_entry_id is null))
  ),
  constraint expense_allocation_sign check (
    (reversal_of is null and gross_cents > 0 and net_cents > 0)
    or (reversal_of is not null and gross_cents < 0 and net_cents < 0)
  )
);
create index ledger_expense_allocations_ledger_idx
  on public.ledger_expense_allocations (tenant_id, ledger_entry_id);
create index ledger_expense_allocations_work_idx
  on public.ledger_expense_allocations (tenant_id, work_order_id)
  where work_order_id is not null;
create index ledger_expense_allocations_contract_idx
  on public.ledger_expense_allocations (tenant_id, contract_id)
  where contract_id is not null;
alter table public.ledger_expense_allocations enable row level security;
revoke all on public.ledger_expense_allocations from public, anon, authenticated;
grant select on public.ledger_expense_allocations to authenticated, service_role;
create policy ledger_expense_allocations_select on public.ledger_expense_allocations
  for select to authenticated using (
    public.has_role(tenant_id, array['owner', 'admin']::public.app_role[])
  );
create trigger ledger_expense_allocations_immutable
  before update or delete on public.ledger_expense_allocations
  for each row execute function public.reject_work_cost_change();

create function public.allocate_ledger_expense(
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
  net_cents bigint;
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
  select * into prior from public.ledger_expense_allocations
  where operation_id = p_operation_id;
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
  select coalesce(sum(gross_cents), 0)::bigint,
    coalesce(sum(net_cents), 0)::bigint
  into allocated_cents, allocated_net_cents
  from public.ledger_expense_allocations
  where ledger_entry_id = p_ledger_entry_id;
  if p_gross_cents > expense.amount_cents - allocated_cents then
    raise exception 'La imputación supera el saldo del gasto' using errcode = '22003';
  end if;
  net_cents := least(
    round(p_gross_cents * 100 / (100 + expense.vat_rate))::bigint,
    round(expense.amount_cents * 100 / (100 + expense.vat_rate))::bigint
      - allocated_net_cents
  );
  if net_cents <= 0 then
    raise exception 'El importe neto debe ser positivo' using errcode = '22023';
  end if;
  if p_work_cost_entry_id is not null then
    select signed_total_cost_cents into cost_cents from public.work_cost_entries
    where id = p_work_cost_entry_id and tenant_id = p_tenant_id
      and work_order_id = p_work_order_id and reversal_of is null for update;
    if not found or cost_cents <> net_cents or exists (
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
    if not found or cost_cents <> net_cents or exists (
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
    p_work_cost_entry_id, p_contract_cost_entry_id, p_gross_cents, net_cents, p_operation_id
  ) returning id into allocation_id;
  return allocation_id;
end;
$$;
revoke all on function public.allocate_ledger_expense(uuid, uuid, uuid, uuid, bigint, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.allocate_ledger_expense(uuid, uuid, uuid, uuid, bigint, uuid, uuid, uuid)
  to authenticated;

create function public.reverse_ledger_expense_allocation(
  p_tenant_id uuid, p_allocation_id uuid, p_operation_id uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  original public.ledger_expense_allocations%rowtype;
  prior public.ledger_expense_allocations%rowtype;
  reversal_id uuid;
begin
  if (select auth.uid()) is null or not public.has_role(
    p_tenant_id, array['owner', 'admin']::public.app_role[]
  ) then raise exception 'Sin permiso para anular imputaciones' using errcode = '42501'; end if;
  if p_allocation_id is null or p_operation_id is null then
    raise exception 'Imputación y operación requeridas' using errcode = '22023';
  end if;
  select * into original from public.ledger_expense_allocations
  where id = p_allocation_id and tenant_id = p_tenant_id and reversal_of is null;
  if not found then raise exception 'Imputación no encontrada' using errcode = 'P0002'; end if;
  perform 1 from public.ledger_entries where id = original.ledger_entry_id for update;
  select * into prior from public.ledger_expense_allocations where operation_id = p_operation_id;
  if found then
    if prior.reversal_of is distinct from p_allocation_id then
      raise exception 'Clave de operación reutilizada' using errcode = '23505';
    end if;
    return prior.id;
  end if;
  if not public.tenant_can_write(p_tenant_id) then
    raise exception 'La empresa no puede anular imputaciones' using errcode = 'P0402';
  end if;
  if exists (select 1 from public.ledger_expense_allocations where reversal_of = p_allocation_id) then
    raise exception 'La imputación ya está anulada' using errcode = '23505';
  end if;
  insert into public.ledger_expense_allocations (
    tenant_id, ledger_entry_id, work_order_id, contract_id, work_cost_entry_id,
    contract_cost_entry_id, gross_cents, net_cents, reversal_of, operation_id
  ) values (
    original.tenant_id, original.ledger_entry_id, original.work_order_id, original.contract_id,
    original.work_cost_entry_id, original.contract_cost_entry_id,
    -original.gross_cents, -original.net_cents, original.id, p_operation_id
  ) returning id into reversal_id;
  return reversal_id;
end;
$$;
revoke all on function public.reverse_ledger_expense_allocation(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reverse_ledger_expense_allocation(uuid, uuid, uuid)
  to authenticated;

-- Keep the source record stable once it has allocation history.
create function public.protect_allocated_ledger_expense()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1 from public.ledger_expense_allocations where ledger_entry_id = old.id
    ) then
      raise exception 'El gasto tiene historial de imputaciones' using errcode = '23503';
    end if;
    return old;
  end if;
  if old is distinct from new and exists (
    select 1 from public.ledger_expense_allocations where ledger_entry_id = old.id
  ) then
    raise exception 'Anula las imputaciones antes de cambiar el gasto' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger ledger_expense_allocation_guard
  before update or delete on public.ledger_entries
  for each row execute function public.protect_allocated_ledger_expense();

-- The existing summary functions already enforce tenant and role checks.
alter function public.work_profitability_summary(uuid, uuid)
  rename to work_profitability_summary_without_expenses;
revoke all on function public.work_profitability_summary_without_expenses(uuid, uuid)
  from public, anon, authenticated;
alter function public.contract_profitability_summary(uuid, uuid)
  rename to contract_profitability_summary_without_expenses;
revoke all on function public.contract_profitability_summary_without_expenses(uuid, uuid)
  from public, anon, authenticated;

create function public.work_profitability_summary(p_tenant_id uuid, p_work_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
  extra_net bigint;
  extra_count bigint;
begin
  result := public.work_profitability_summary_without_expenses(p_tenant_id, p_work_order_id);
  select coalesce(sum(a.net_cents), 0)::bigint, count(*)
  into extra_net, extra_count
  from public.ledger_expense_allocations a
  where a.tenant_id = p_tenant_id and a.work_order_id = p_work_order_id
    and a.reversal_of is null
    and not exists (select 1 from public.ledger_expense_allocations r where r.reversal_of = a.id)
    and (a.work_cost_entry_id is null or exists (
      select 1 from public.work_cost_entries r where r.reversal_of = a.work_cost_entry_id
    ));
  return result || jsonb_build_object(
    'actualCostCents', (result->>'actualCostCents')::bigint + extra_net,
    'activeCostCount', (result->>'activeCostCount')::bigint + extra_count,
    'allocatedExpenseNetCents', extra_net,
    'expenseAllocationCount', extra_count
  );
end;
$$;
revoke all on function public.work_profitability_summary(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.work_profitability_summary(uuid, uuid) to authenticated;

create function public.contract_profitability_summary(p_tenant_id uuid, p_contract_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
  extra_net bigint;
  extra_count bigint;
begin
  result := public.contract_profitability_summary_without_expenses(p_tenant_id, p_contract_id);
  select coalesce(sum(a.net_cents), 0)::bigint, count(*)
  into extra_net, extra_count
  from public.ledger_expense_allocations a
  where a.tenant_id = p_tenant_id and a.contract_id = p_contract_id
    and a.reversal_of is null
    and not exists (select 1 from public.ledger_expense_allocations r where r.reversal_of = a.id)
    and (a.contract_cost_entry_id is null or exists (
      select 1 from public.contract_cost_entries r where r.reversal_of = a.contract_cost_entry_id
    ));
  return result || jsonb_build_object(
    'actualCostCents', (result->>'actualCostCents')::bigint + extra_net,
    'activeCostCount', (result->>'activeCostCount')::bigint + extra_count,
    'allocatedExpenseNetCents', extra_net,
    'expenseAllocationCount', extra_count
  );
end;
$$;
revoke all on function public.contract_profitability_summary(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.contract_profitability_summary(uuid, uuid) to authenticated;
