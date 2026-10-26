import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { WorkProfitabilitySummary } from '../domain/work-profitability'

export async function loadWorkProfitability(tenantId: string, workOrderId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('work_profitability_summary', {
    p_tenant_id: tenantId,
    p_work_order_id: workOrderId,
  })
  if (error || !data || typeof data !== 'object')
    throw new Error(error?.message ?? 'No se pudo calcular la rentabilidad.')
  return data as WorkProfitabilitySummary
}
