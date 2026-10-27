import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type IncidentPriority = 'low' | 'normal' | 'high' | 'urgent'
export type IncidentStatus = 'open' | 'in_progress' | 'resolved' | 'reopened' | 'canceled'
export type IncidentCoverage = 'unassessed' | 'contract' | 'warranty' | 'chargeable' | 'excluded'

export type Incident = {
  id: string
  client_id: string
  location_id: string | null
  asset_id: string | null
  equipment_id: string | null
  source_visit_id: string | null
  title: string
  description: string
  priority: IncidentPriority
  status: IncidentStatus
  assigned_user_id: string | null
  due_at: string | null
  coverage_kind: IncidentCoverage
  coverage_evidence: string
  diagnosis: string
  resolution: string
  created_at: string
  updated_at: string
  resolved_at: string | null
}

export type IncidentEvent = {
  operation_id: string
  kind: 'created' | 'updated'
  before_state: { status?: IncidentStatus; coverage_kind?: IncidentCoverage } | null
  after_state: { status?: IncidentStatus; coverage_kind?: IncidentCoverage }
  occurred_at: string
}

export type IncidentConversionKind = 'estimate' | 'work' | 'visit'
export type IncidentConversion = {
  operation_id: string
  kind: IncidentConversionKind
  estimate_id: string | null
  work_order_id: string | null
  visit_id: string | null
  created_at: string
}

export async function listIncidentConversions(tenantId: string, incidentId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_incident_conversions')
    .select('operation_id,kind,estimate_id,work_order_id,visit_id,created_at')
    .eq('tenant_id', tenantId)
    .eq('incident_id', incidentId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as IncidentConversion[]
}

export async function loadIncidentTimezone(tenantId: string, locationId: string | null) {
  if (!locationId) return 'Europe/Madrid'
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_locations')
    .select('timezone')
    .eq('tenant_id', tenantId)
    .eq('id', locationId)
    .single()
  if (error) throw new Error(error.message)
  return data.timezone as string
}

export async function convertIncident(input: {
  tenantId: string
  incidentId: string
  kind: IncidentConversionKind
  localStart: string | null
  durationMinutes: number | null
  assignedUserId: string | null
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc('convert_service_incident', {
    p_tenant_id: input.tenantId,
    p_incident_id: input.incidentId,
    p_kind: input.kind,
    p_local_start: input.localStart,
    p_duration_minutes: input.durationMinutes,
    p_assigned_user_id: input.assignedUserId,
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function listIncidents(
  tenantId: string,
  filter: { clientId?: string; visitId?: string },
  page: number,
) {
  const pageSize = 20
  let query = createBrowserSupabaseClient()
    .from('service_incidents')
    .select(
      'id,client_id,location_id,asset_id,equipment_id,source_visit_id,title,description,priority,status,assigned_user_id,due_at,coverage_kind,coverage_evidence,diagnosis,resolution,created_at,updated_at,resolved_at',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.visitId) query = query.eq('source_visit_id', filter.visitId)
  const { data, count, error } = await query
  if (error) throw new Error(error.message)
  return { incidents: (data ?? []) as Incident[], count: count ?? 0, pageSize }
}

export async function listIncidentEvents(tenantId: string, incidentId: string, page: number) {
  const pageSize = 20
  const { data, count, error } = await createBrowserSupabaseClient()
    .from('service_incident_events')
    .select('operation_id,kind,before_state,after_state,occurred_at', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('incident_id', incidentId)
    .order('occurred_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) throw new Error(error.message)
  return { events: (data ?? []) as IncidentEvent[], count: count ?? 0, pageSize }
}

export async function loadIncident(tenantId: string, incidentId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('service_incidents')
    .select(
      'id,client_id,location_id,asset_id,equipment_id,source_visit_id,title,description,priority,status,assigned_user_id,due_at,coverage_kind,coverage_evidence,diagnosis,resolution,created_at,updated_at,resolved_at',
    )
    .eq('tenant_id', tenantId)
    .eq('id', incidentId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Incident | null
}

export async function createIncident(input: {
  tenantId: string
  clientId: string | null
  locationId: string | null
  assetId: string | null
  equipmentId: string | null
  sourceVisitId: string | null
  title: string
  description: string
  priority: IncidentPriority
  assignedUserId: string | null
  dueAt: string | null
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc('create_service_incident', {
    p_tenant_id: input.tenantId,
    p_client_id: input.clientId,
    p_location_id: input.locationId,
    p_asset_id: input.assetId,
    p_equipment_id: input.equipmentId,
    p_source_visit_id: input.sourceVisitId,
    p_title: input.title,
    p_description: input.description,
    p_priority: input.priority,
    p_assigned_user_id: input.assignedUserId,
    p_due_at: input.dueAt,
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function updateIncident(input: {
  tenantId: string
  incidentId: string
  expectedUpdatedAt: string
  status: IncidentStatus
  priority: IncidentPriority
  assignedUserId: string | null
  dueAt: string | null
  coverageKind: IncidentCoverage
  coverageEvidence: string
  diagnosis: string
  resolution: string
  operationId: string
}) {
  const { data, error } = await createBrowserSupabaseClient().rpc('update_service_incident', {
    p_tenant_id: input.tenantId,
    p_incident_id: input.incidentId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_status: input.status,
    p_priority: input.priority,
    p_assigned_user_id: input.assignedUserId,
    p_due_at: input.dueAt,
    p_coverage_kind: input.coverageKind,
    p_coverage_evidence: input.coverageEvidence,
    p_diagnosis: input.diagnosis,
    p_resolution: input.resolution,
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function listIncidentAssignees(tenantId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('memberships')
    .select('user_id,role,profiles(email,full_name)')
    .eq('tenant_id', tenantId)
    .in('role', ['owner', 'admin', 'editor', 'technician'])
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return { id: row.user_id as string, label: profile?.full_name || profile?.email || 'Miembro' }
  })
}
