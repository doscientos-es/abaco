import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type VisitChecklistItem = { id: string; label: string; done: boolean }
export type VisitReportData = {
  notes: string
  checklist: VisitChecklistItem[]
  recommendations?: string
  next_actions?: string
}
export type VisitReport = {
  visit_id: string
  tenant_id: string
  data: VisitReportData
  revision: number
  updated_at: string
  updated_by: string
}

export type ClosedVisitReport = {
  id: string
  version: number
  closed_at: string
  snapshot: {
    company: { name: string }
    client: { name: string }
    location: { name: string; address: string } | null
    asset: { name: string } | null
    visit: { title: string; actual_start_at: string | null; actual_end_at: string | null }
    report: { revision: number; data: VisitReportData }
    tasks: { id: string; title: string; status: string; phase: string }[]
    measurements: {
      id: string
      label: string
      value: number
      unit: string
      assessment: string
      measured_at: string
    }[]
    activities: {
      id: string
      kind: string
      description: string
      quantity: number
      unit: string
      occurred_at: string
    }[]
    incidents: {
      id: string
      title: string
      status: string
      diagnosis: string
      resolution: string
    }[]
  }
}

export async function loadClosedVisitReport(tenantId: string, visitId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_visit_report_versions')
    .select('id,version,closed_at,snapshot')
    .eq('tenant_id', tenantId)
    .eq('visit_id', visitId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as ClosedVisitReport | null) ?? null
}

export async function loadVisitReport(tenantId: string, visitId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_visit_reports')
    .select('visit_id,tenant_id,data,revision,updated_at,updated_by')
    .eq('tenant_id', tenantId)
    .eq('visit_id', visitId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as VisitReport | null) ?? null
}

export async function saveVisitReport(input: {
  tenantId: string
  visitId: string
  expectedRevision: number
  data: VisitReportData
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc('save_service_visit_report', {
    p_tenant_id: input.tenantId,
    p_visit_id: input.visitId,
    p_expected_revision: input.expectedRevision,
    p_data: input.data,
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}
