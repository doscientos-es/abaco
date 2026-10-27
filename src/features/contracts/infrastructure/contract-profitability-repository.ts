import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type ContractProfitabilitySummary = {
  actualCostCents: number
  activeCostCount: number
  allocatedExpenseNetCents?: number
  expenseAllocationCount?: number
  billedNetCents: number
  billedGrossCents: number
  collectedGrossCents: number
  invoiceCount: number
}

export async function loadContractProfitability(tenantId: string, contractId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'contract_profitability_summary',
    { p_tenant_id: tenantId, p_contract_id: contractId },
  )
  if (error || !data || typeof data !== 'object')
    throw new Error(error?.message ?? 'No se pudo calcular la rentabilidad.')
  return data as ContractProfitabilitySummary
}
