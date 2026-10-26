import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type ExpenseAllocation = {
  id: string
  ledger_entry_id: string
  work_order_id: string | null
  contract_id: string | null
  work_cost_entry_id: string | null
  contract_cost_entry_id: string | null
  gross_cents: number
  net_cents: number
  reversal_of: string | null
}

export type AllocationTarget = { id: string; title: string; kind: 'work' | 'contract' }
export type MatchingCost = {
  id: string
  description: string
  incurred_on: string
  signed_total_cost_cents: number
  reversal_of: string | null
}

export async function loadExpenseAllocations(tenantId: string, ledgerEntryId: string) {
  const db = createBrowserSupabaseClient()
  const events: ExpenseAllocation[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from('ledger_expense_allocations')
      .select(
        'id,ledger_entry_id,work_order_id,contract_id,work_cost_entry_id,contract_cost_entry_id,gross_cents,net_cents,reversal_of',
      )
      .eq('tenant_id', tenantId)
      .eq('ledger_entry_id', ledgerEntryId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 499)
    if (error) throw new Error(error.message)
    events.push(...((data ?? []) as ExpenseAllocation[]))
    if (!data || data.length < 500) break
  }
  const reversed = new Set(
    events.flatMap((event) => (event.reversal_of ? [event.reversal_of] : [])),
  )
  return events.filter((event) => !event.reversal_of && !reversed.has(event.id))
}

export async function hasExpenseAllocationHistory(tenantId: string, ledgerEntryId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('ledger_expense_allocations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('ledger_entry_id', ledgerEntryId)
    .limit(1)
  if (error) throw new Error(error.message)
  return (data?.length ?? 0) > 0
}

export async function hasProtectedLedgerHistory(
  tenantId: string,
  ledgerEntryId: string,
  kind: 'income' | 'expense',
) {
  if (kind === 'expense') return hasExpenseAllocationHistory(tenantId, ledgerEntryId)
  const db = createBrowserSupabaseClient()
  const [payments, refunds] = await Promise.all([
    db
      .from('invoice_payment_operations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('ledger_entry_id', ledgerEntryId)
      .limit(1),
    db
      .from('invoice_payment_refunds')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('ledger_entry_id', ledgerEntryId)
      .limit(1),
  ])
  if (payments.error || refunds.error)
    throw new Error(
      payments.error?.message ?? refunds.error?.message ?? 'No se pudo comprobar el asiento',
    )
  return (payments.data?.length ?? 0) > 0 || (refunds.data?.length ?? 0) > 0
}

export async function loadAllocationTargets(tenantId: string): Promise<AllocationTarget[]> {
  const db = createBrowserSupabaseClient()
  async function loadKind(
    table: 'work_orders' | 'service_contracts',
    kind: AllocationTarget['kind'],
  ) {
    const rows: AllocationTarget[] = []
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db
        .from(table)
        .select('id,title')
        .eq('tenant_id', tenantId)
        .order('title')
        .order('id')
        .range(offset, offset + 499)
      if (error) throw new Error(error.message)
      rows.push(...(data ?? []).map((row) => ({ ...row, kind })))
      if (!data || data.length < 500) return rows
    }
  }
  const [works, contracts] = await Promise.all([
    loadKind('work_orders', 'work'),
    loadKind('service_contracts', 'contract'),
  ])
  return [...works, ...contracts]
}

export async function loadMatchingCosts(tenantId: string, target: AllocationTarget) {
  const db = createBrowserSupabaseClient()
  const entries: MatchingCost[] = []
  for (let offset = 0; ; offset += 500) {
    const query =
      target.kind === 'work' ? db.from('work_cost_entries') : db.from('contract_cost_entries')
    const { data, error } = await query
      .select('id,description,incurred_on,signed_total_cost_cents,reversal_of')
      .eq('tenant_id', tenantId)
      .eq(target.kind === 'work' ? 'work_order_id' : 'contract_id', target.id)
      .order('created_at', { ascending: false })
      .order('id')
      .range(offset, offset + 499)
    if (error) throw new Error(error.message)
    entries.push(...((data ?? []) as MatchingCost[]))
    if (!data || data.length < 500) break
  }
  const reversed = new Set(
    entries.flatMap((entry) => (entry.reversal_of ? [entry.reversal_of] : [])),
  )
  return entries.filter((entry) => !entry.reversal_of && !reversed.has(entry.id))
}

export async function allocateExpense(input: {
  tenantId: string
  ledgerEntryId: string
  target: AllocationTarget
  grossCents: number
  costEntryId: string | null
  operationId: string
}) {
  const { error } = await createBrowserSupabaseClient().rpc('allocate_ledger_expense', {
    p_tenant_id: input.tenantId,
    p_ledger_entry_id: input.ledgerEntryId,
    p_work_order_id: input.target.kind === 'work' ? input.target.id : null,
    p_contract_id: input.target.kind === 'contract' ? input.target.id : null,
    p_gross_cents: input.grossCents,
    p_work_cost_entry_id: input.target.kind === 'work' ? input.costEntryId : null,
    p_contract_cost_entry_id: input.target.kind === 'contract' ? input.costEntryId : null,
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
}

export async function reverseExpenseAllocation(
  tenantId: string,
  allocationId: string,
  operationId: string,
) {
  const { error } = await createBrowserSupabaseClient().rpc('reverse_ledger_expense_allocation', {
    p_tenant_id: tenantId,
    p_allocation_id: allocationId,
    p_operation_id: operationId,
  })
  if (error) throw new Error(error.message)
}
