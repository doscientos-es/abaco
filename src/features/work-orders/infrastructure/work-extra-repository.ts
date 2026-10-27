import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type WorkExtraDecision = {
  id: string
  extra_id: string
  decision: 'approved' | 'rejected'
  evidence_mode: 'office_manual'
  evidence_description: string
  customer_name: string
  decided_at: string
}

export type WorkExtra = {
  id: string
  description: string
  quantity: number
  unit: string
  unit_price_cents: number
  unit_cost_cents: number
  price_cents: number
  planned_cost_cents: number
  vat_rate: number
  status: 'pending' | 'approved' | 'rejected'
  proposed_at: string
  decided_at: string | null
}

export async function listWorkExtras(tenantId: string, workOrderId: string, page: number) {
  const pageSize = 20
  const db = createBrowserSupabaseClient()
  const { data, count, error } = await db
    .from('work_order_extras')
    .select(
      'id,description,quantity,unit,unit_price_cents,unit_cost_cents,price_cents,planned_cost_cents,vat_rate,status,proposed_at,decided_at',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId)
    .eq('work_order_id', workOrderId)
    .order('proposed_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) throw new Error(error.message)
  const extras = (data ?? []) as WorkExtra[]
  const ids = extras.map((extra) => extra.id)
  if (!ids.length)
    return { extras, decisions: [], invoices: [], drafts: [], count: count ?? 0, pageSize }
  const [decisions, invoices, drafts] = await Promise.all([
    db
      .from('work_extra_decisions')
      .select('id,extra_id,decision,evidence_mode,evidence_description,customer_name,decided_at')
      .eq('tenant_id', tenantId)
      .eq('work_order_id', workOrderId)
      .in('extra_id', ids),
    db
      .from('invoices')
      .select('id,work_extra_id,number')
      .eq('tenant_id', tenantId)
      .in('work_extra_id', ids),
    db
      .from('invoice_work_extra_drafts')
      .select('id,work_extra_id,status')
      .eq('tenant_id', tenantId)
      .in('work_extra_id', ids),
  ])
  if (decisions.error) throw new Error(decisions.error.message)
  if (invoices.error) throw new Error(invoices.error.message)
  if (drafts.error) throw new Error(drafts.error.message)
  return {
    extras,
    decisions: (decisions.data ?? []) as WorkExtraDecision[],
    invoices: (invoices.data ?? []) as Array<{
      id: string
      work_extra_id: string
      number: string
    }>,
    drafts: (drafts.data ?? []) as Array<{
      id: string
      work_extra_id: string
      status: 'draft' | 'issued'
    }>,
    count: count ?? 0,
    pageSize,
  }
}

export async function proposeWorkExtra(input: {
  tenantId: string
  workOrderId: string
  description: string
  quantity: number
  unit: string
  unitPriceCents: number
  unitCostCents: number
  vatRate: number
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc('propose_work_extra', {
    p_tenant_id: input.tenantId,
    p_work_order_id: input.workOrderId,
    p_description: input.description.trim(),
    p_quantity: input.quantity,
    p_unit: input.unit.trim(),
    p_unit_price_cents: input.unitPriceCents,
    p_unit_cost_cents: input.unitCostCents,
    p_vat_rate: input.vatRate,
    p_operation_id: input.operationId,
  })
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo proponer el extra.')
  return data
}

export async function decideWorkExtra(input: {
  tenantId: string
  extraId: string
  decision: 'approved' | 'rejected'
  customerName: string
  evidenceDescription: string
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc('decide_work_extra', {
    p_tenant_id: input.tenantId,
    p_extra_id: input.extraId,
    p_decision: input.decision,
    p_customer_name: input.customerName.trim(),
    p_evidence_description: input.evidenceDescription.trim(),
    p_operation_id: input.operationId,
  })
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo registrar la decisión.')
  return data
}
