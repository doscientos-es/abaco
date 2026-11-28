import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import { indexVisitReportGates, type VisitReportGate } from '../domain/visit-billing-queue'

export type CoverageInvoice = {
  id: string
  number: string
  concept: string
  total_cents: number
  issued_at: string
}

export type VisitBillingReview = {
  visitId: string
  sourceKind: 'contract' | 'work_order' | 'standalone'
  status: 'pending' | 'included' | 'bill_separately'
  createdAt: string
  visitTitle: string
  clientName: string
  clientId: string
  reportGate: VisitReportGate
  coverageInvoiceId: string | null
  coverageInvoiceNumber: string | null
}

export async function listVisitBillingReviews(
  tenantId: string,
  page = 0,
  mode: 'open' | 'linked' = 'open',
): Promise<{ reviews: VisitBillingReview[]; hasNext: boolean }> {
  const db = createBrowserSupabaseClient()
  const query = db
    .from('service_visit_billing_reviews')
    .select('visit_id,client_id,source_kind,status,created_at,coverage_invoice_id')
    .eq('tenant_id', tenantId)
    .in('status', ['pending', 'bill_separately'])
  const { data, error } = await (
    mode === 'open'
      ? query.is('coverage_invoice_id', null)
      : query.not('coverage_invoice_id', 'is', null)
  )
    .order('created_at', { ascending: false })
    .order('visit_id', { ascending: false })
    .range(page * 50, page * 50 + 50)
  if (error) throw new Error(error.message)
  const rows = (data ?? []).slice(0, 50)
  const hasNext = (data?.length ?? 0) > rows.length
  if (!rows.length) return { reviews: [], hasNext }
  const linkedInvoiceIds = rows.flatMap((row) =>
    typeof row.coverage_invoice_id === 'string' ? [row.coverage_invoice_id] : [],
  )
  const visitIds = rows.map((row) => row.visit_id)
  const [visits, clients, versions, invoices] = await Promise.all([
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
    linkedInvoiceIds.length
      ? db.from('invoices').select('id,number').eq('tenant_id', tenantId).in('id', linkedInvoiceIds)
      : { data: [], error: null },
  ])
  if (visits.error) throw new Error(visits.error.message)
  if (clients.error) throw new Error(clients.error.message)
  if (versions.error) throw new Error(versions.error.message)
  if (invoices.error) throw new Error(invoices.error.message)
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
  const invoiceNumbers = new Map(
    (invoices.data ?? []).map((invoice) => [invoice.id, invoice.number]),
  )
  return {
    hasNext,
    reviews: rows.map((row) => ({
      visitId: row.visit_id,
      sourceKind: row.source_kind as VisitBillingReview['sourceKind'],
      status: row.status as VisitBillingReview['status'],
      createdAt: row.created_at,
      visitTitle: visitNames.get(row.visit_id) ?? 'Visita',
      clientName: clientNames.get(row.client_id) ?? 'Cliente',
      clientId: row.client_id,
      reportGate: gates.get(row.visit_id) ?? 'missing',
      coverageInvoiceId: row.coverage_invoice_id,
      coverageInvoiceNumber: invoiceNumbers.get(row.coverage_invoice_id) ?? null,
    })),
  }
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

// Exact invoice number plus tenant and client: results are only candidates, never automatic proof.
export async function findIssuedVisitInvoice(
  tenantId: string,
  clientId: string,
  invoiceNumber: string,
): Promise<CoverageInvoice | null> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('invoices')
    .select('id,number,concept,total_cents,issued_at')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .eq('number', invoiceNumber.trim().toUpperCase())
    .eq('status', 'issued')
    .gt('total_cents', 0)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function setVisitInvoiceCoverage(input: {
  tenantId: string
  visitId: string
  invoiceId: string
  action: 'attach' | 'detach'
  confirmFullCoverage: boolean
  reason: string
  operationId: string
}): Promise<void> {
  const { error } = await createBrowserSupabaseClient().rpc('set_service_visit_invoice_coverage', {
    p_tenant_id: input.tenantId,
    p_visit_id: input.visitId,
    p_invoice_id: input.invoiceId,
    p_action: input.action,
    p_confirm_full_coverage: input.confirmFullCoverage,
    p_reason: input.reason,
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
}
