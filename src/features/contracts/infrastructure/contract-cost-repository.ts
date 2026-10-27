import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type ContractCostKind = 'labor' | 'material' | 'product' | 'travel' | 'subcontract' | 'other'
export type ContractCostEntry = {
  id: string
  visit_id: string | null
  reversal_of: string | null
  kind: ContractCostKind
  description: string
  quantity: number
  unit: string
  unit_cost_cents: number
  signed_total_cost_cents: number
  incurred_on: string
  supplier: string
}

export async function listContractCosts(tenantId: string, contractId: string, page: number) {
  const pageSize = 20
  const db = createBrowserSupabaseClient()
  const { data, count, error } = await db
    .from('contract_cost_entries')
    .select(
      'id,visit_id,reversal_of,kind,description,quantity,unit,unit_cost_cents,signed_total_cost_cents,incurred_on,supplier',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId)
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) throw new Error(error.message)
  const entries = (data ?? []) as ContractCostEntry[]
  const originalIds = entries.filter((entry) => !entry.reversal_of).map((entry) => entry.id)
  let reversedIds: string[] = []
  if (originalIds.length) {
    const reversals = await db
      .from('contract_cost_entries')
      .select('reversal_of')
      .eq('tenant_id', tenantId)
      .eq('contract_id', contractId)
      .in('reversal_of', originalIds)
    if (reversals.error) throw new Error(reversals.error.message)
    reversedIds = (reversals.data ?? []).flatMap((row) =>
      typeof row.reversal_of === 'string' ? [row.reversal_of] : [],
    )
  }
  return { entries, count: count ?? 0, pageSize, reversedIds }
}

export async function loadContractCostSummary(tenantId: string, contractId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('contract_cost_summary', {
    p_tenant_id: tenantId,
    p_contract_id: contractId,
  })
  if (error || !data || typeof data !== 'object')
    throw new Error(error?.message ?? 'No se pudo calcular el coste.')
  return data as { netCents: number; activeCount: number }
}

export async function recordContractCost(input: {
  tenantId: string
  contractId: string
  visitId: string | null
  kind: ContractCostKind
  description: string
  quantity: number
  unit: string
  unitCostCents: number
  incurredOn: string
  supplier: string
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc('record_contract_cost', {
    p_tenant_id: input.tenantId,
    p_contract_id: input.contractId,
    p_visit_id: input.visitId,
    p_kind: input.kind,
    p_description: input.description,
    p_quantity: input.quantity,
    p_unit: input.unit,
    p_unit_cost_cents: input.unitCostCents,
    p_incurred_on: input.incurredOn,
    p_supplier: input.supplier,
    p_operation_id: input.operationId,
  })
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo registrar el coste.')
  return data
}

export async function reverseContractCost(tenantId: string, entryId: string, operationId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('reverse_contract_cost', {
    p_tenant_id: tenantId,
    p_entry_id: entryId,
    p_operation_id: operationId,
  })
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo anular el coste.')
  return data
}
