import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type WorkCostKind = 'labor' | 'material' | 'product' | 'travel' | 'subcontract' | 'other'

export type WorkCostEntry = {
  id: string
  task_id: string | null
  reversal_of: string | null
  kind: WorkCostKind
  description: string
  quantity: number
  unit: string
  unit_cost_cents: number
  signed_total_cost_cents: number
  incurred_on: string
  supplier: string
  created_at: string
}

export async function listWorkCosts(tenantId: string, workOrderId: string, page: number) {
  const pageSize = 20
  const db = createBrowserSupabaseClient()
  const { data, count, error } = await db
    .from('work_cost_entries')
    .select(
      'id,task_id,reversal_of,kind,description,quantity,unit,unit_cost_cents,signed_total_cost_cents,incurred_on,supplier,created_at',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId)
    .eq('work_order_id', workOrderId)
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) throw new Error(error.message)
  const entries = (data ?? []) as WorkCostEntry[]
  const originalIds = entries.filter((entry) => !entry.reversal_of).map((entry) => entry.id)
  let reversedIds: string[] = []
  if (originalIds.length) {
    const result = await db
      .from('work_cost_entries')
      .select('reversal_of')
      .eq('tenant_id', tenantId)
      .eq('work_order_id', workOrderId)
      .in('reversal_of', originalIds)
    if (result.error) throw new Error(result.error.message)
    reversedIds = (result.data ?? []).flatMap((row) =>
      typeof row.reversal_of === 'string' ? [row.reversal_of] : [],
    )
  }
  return { entries, count: count ?? 0, pageSize, reversedIds }
}

export async function loadWorkCostSummary(tenantId: string, workOrderId: string) {
  const { data, error } = await createBrowserSupabaseClient().rpc('work_cost_summary', {
    p_tenant_id: tenantId,
    p_work_order_id: workOrderId,
  })
  if (error || !data || typeof data !== 'object')
    throw new Error(error?.message ?? 'No se pudo calcular el coste real.')
  return data as { netCents: number; entryCount: number }
}

export async function recordWorkCost(input: {
  tenantId: string
  workOrderId: string
  taskId: string | null
  kind: WorkCostKind
  description: string
  quantity: number
  unit: string
  unitCostCents: number
  incurredOn: string
  supplier: string
  operationId: string
}): Promise<string> {
  const { data, error } = await createBrowserSupabaseClient().rpc('record_work_cost', {
    p_tenant_id: input.tenantId,
    p_work_order_id: input.workOrderId,
    p_task_id: input.taskId,
    p_kind: input.kind,
    p_description: input.description.trim(),
    p_quantity: input.quantity,
    p_unit: input.unit.trim(),
    p_unit_cost_cents: input.unitCostCents,
    p_incurred_on: input.incurredOn,
    p_supplier: input.supplier.trim(),
    p_operation_id: input.operationId,
  })
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo registrar el coste.')
  return data
}

export async function reverseWorkCost(
  tenantId: string,
  entryId: string,
  operationId: string,
): Promise<string> {
  const { data, error } = await createBrowserSupabaseClient().rpc('reverse_work_cost', {
    p_tenant_id: tenantId,
    p_entry_id: entryId,
    p_operation_id: operationId,
  })
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo anular el coste.')
  return data
}
