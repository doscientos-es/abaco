import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import { indexVisitReportGates, type VisitReportGate } from '../domain/visit-billing-queue'

export type VisitBillingReview = {
  visitId: string
  sourceKind: 'contract' | 'work_order' | 'standalone'
  status: 'pending' | 'included' | 'bill_separately'
  createdAt: string
  visitTitle: string
  clientName: string
  clientId: string
  reportGate: VisitReportGate
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
  const visitIds = rows.map((row) => row.visit_id)
  const [visits, clients, versions] = await Promise.all([
    db.from('service_visits').select('id,title').eq('tenant_id', tenantId).in('id', visitIds),
    db
      .from('clients')
      .select('id,name')
      .eq('tenant_id', tenantId)
      .in(
        'id',
        rows.map((row) => row.client_id),
      ),
    db
      .from('service_visit_report_versions')
      .select('id,visit_id,version')
      .eq('tenant_id', tenantId)
      .in('visit_id', visitIds)
      .order('version', { ascending: false })
      .limit(1001),
  ])
  if (visits.error) throw new Error(visits.error.message)
  if (clients.error) throw new Error(clients.error.message)
  if (versions.error) throw new Error(versions.error.message)
  const allVersions = versions.data ?? []
  // The response must cover every requested visit; never label a truncated result as missing.
  if (allVersions.length >= 1000)
    throw new Error('No se pudo confirmar el estado de todos los partes.')
  const latestByVisit = new Map<string, string>()
  for (const version of allVersions)
    if (!latestByVisit.has(version.visit_id)) latestByVisit.set(version.visit_id, version.id)
  const reportIds = [...latestByVisit.values()]
  const checked = reportIds.length
    ? await db
        .from('service_visit_report_reviews')
        .select('report_version_id')
        .eq('tenant_id', tenantId)
        .in('report_version_id', reportIds)
    : { data: [], error: null }
  if (checked.error) throw new Error(checked.error.message)
  const reviewed = new Set((checked.data ?? []).map((row) => row.report_version_id))
  const gates = indexVisitReportGates(allVersions, reviewed)
  const visitNames = new Map((visits.data ?? []).map((visit) => [visit.id, visit.title]))
  const clientNames = new Map((clients.data ?? []).map((client) => [client.id, client.name]))
  return rows.map((row) => ({
    visitId: row.visit_id,
    sourceKind: row.source_kind as VisitBillingReview['sourceKind'],
    status: row.status as VisitBillingReview['status'],
    createdAt: row.created_at,
    visitTitle: visitNames.get(row.visit_id) ?? 'Visita',
    clientName: clientNames.get(row.client_id) ?? 'Cliente',
    clientId: row.client_id,
    reportGate: gates.get(row.visit_id) ?? 'missing',
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
