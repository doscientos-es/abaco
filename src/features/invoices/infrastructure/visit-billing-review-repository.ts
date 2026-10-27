import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type VisitBillingReview = {
  visitId: string
  sourceKind: 'contract' | 'work_order' | 'standalone'
  status: 'pending' | 'included' | 'bill_separately'
  createdAt: string
  visitTitle: string
  clientName: string
}

export async function listOpenVisitBillingReviews(
  tenantId: string,
  page = 0,
): Promise<VisitBillingReview[]> {
  const db = createBrowserSupabaseClient()
  const { data, error } = await db
    .from('service_visit_billing_reviews')
    .select('visit_id,client_id,source_kind,status,created_at')
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'bill_separately'])
    .order('created_at', { ascending: false })
    .range(page * 50, page * 50 + 49)
  if (error) throw new Error(error.message)
  const rows = data ?? []
  if (!rows.length) return []
  const [visits, clients] = await Promise.all([
    db
      .from('service_visits')
      .select('id,title')
      .eq('tenant_id', tenantId)
      .in(
        'id',
        rows.map((row) => row.visit_id),
      ),
    db
      .from('clients')
      .select('id,name')
      .eq('tenant_id', tenantId)
      .in(
        'id',
        rows.map((row) => row.client_id),
      ),
  ])
  if (visits.error) throw new Error(visits.error.message)
  if (clients.error) throw new Error(clients.error.message)
  const visitNames = new Map((visits.data ?? []).map((visit) => [visit.id, visit.title]))
  const clientNames = new Map((clients.data ?? []).map((client) => [client.id, client.name]))
  return rows.map((row) => ({
    visitId: row.visit_id,
    sourceKind: row.source_kind as VisitBillingReview['sourceKind'],
    status: row.status as VisitBillingReview['status'],
    createdAt: row.created_at,
    visitTitle: visitNames.get(row.visit_id) ?? 'Visita',
    clientName: clientNames.get(row.client_id) ?? 'Cliente',
  }))
}

export async function decideVisitBillingReview(input: {
  tenantId: string
  visitId: string
  decision: 'included' | 'bill_separately'
  reason: string
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'decide_service_visit_billing_review',
    {
      p_tenant_id: input.tenantId,
      p_visit_id: input.visitId,
      p_decision: input.decision,
      p_reason: input.reason,
      p_operation_id: input.operationId,
    },
  )
  if (error) throw new Error(error.message)
  return data as 'included' | 'bill_separately'
}
