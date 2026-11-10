import type { Estimate } from '@/shared/domain/types'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { estimateFromRow, type EstimateRow } from '@/shared/store/supabase-mappers'

import type { WorkSearch } from '../domain/work-search'

export type WorkOrderStatus = 'ready' | 'scheduled' | 'in_progress' | 'completed' | 'canceled'

export type WorkOrder = {
  id: string
  tenant_id: string
  client_id: string
  origin_estimate_id: string | null
  location_id: string | null
  asset_id: string | null
  title: string
  description: string
  responsible_user_id: string | null
  work_team_id: string | null
  planned_start_at: string | null
  planned_end_at: string | null
  actual_start_at: string | null
  actual_end_at: string | null
  kind: 'installation' | 'repair' | 'maintenance' | 'other'
  status: WorkOrderStatus
  created_at: string
  updated_at: string
}

export type WorkOrderEvent = {
  id: string
  kind:
    | 'created'
    | 'status_changed'
    | 'plan_changed'
    | 'phase_added'
    | 'task_added'
    | 'task_status_changed'
    | 'checklist_item_added'
    | 'checklist_item_changed'
  payload: { from?: WorkOrderStatus; to?: WorkOrderStatus }
  occurred_at: string
}

export type WorkOrderDetail = WorkOrder & {
  originKind: 'estimate' | 'manual' | 'incident'
  originIncidentId: string | null
  scope: Estimate | null
  customerName: string
  locationName: string | null
  acceptance: {
    mode: 'public_link' | 'office_manual' | 'legacy_unverified'
    responded_at: string | null
    responded_by: string | null
    evidence_description?: string | null
  } | null
  publicationSource: 'publication' | 'migration' | null
  events: WorkOrderEvent[]
}

const workColumns =
  'id,tenant_id,client_id,origin_estimate_id,location_id,asset_id,title,description,responsible_user_id,work_team_id,planned_start_at,planned_end_at,actual_start_at,actual_end_at,kind,status,created_at,updated_at'

export async function listWorkOrders(
  tenantId: string,
  page: number,
  pageSize = 20,
  filters: WorkSearch = {},
) {
  let query = createBrowserSupabaseClient()
    .from('work_orders')
    .select(workColumns, { count: 'exact' })
    .eq('tenant_id', tenantId)
  if (filters.equipo === 'unassigned') query = query.is('work_team_id', null)
  else if (filters.equipo) query = query.eq('work_team_id', filters.equipo)
  if (filters.estado) query = query.eq('status', filters.estado)
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) throw new Error(error.message)
  return { items: (data ?? []) as WorkOrder[], count: count ?? 0, pageSize }
}

export async function findWorkOrderForEstimate(tenantId: string, estimateId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('work_orders')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('origin_estimate_id', estimateId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id as string | undefined
}

export async function loadWorkOrder(tenantId: string, workOrderId: string) {
  const db = createBrowserSupabaseClient()
  const { data, error } = await db
    .from('work_orders')
    .select(`${workColumns},source_snapshot`)
    .eq('tenant_id', tenantId)
    .eq('id', workOrderId)
    .maybeSingle()
  if (error || !data) throw new Error(error?.message ?? 'Trabajo no encontrado.')
  const snapshot = data.source_snapshot as {
    estimate?: EstimateRow
    client?: { name?: string }
    location?: { name?: string } | null
    origin_kind?: 'manual' | 'incident'
    incident_id?: string
    acceptance?: WorkOrderDetail['acceptance']
    publication_source?: WorkOrderDetail['publicationSource']
  }
  if (
    !(snapshot.estimate && snapshot.acceptance) &&
    snapshot.origin_kind !== 'manual' &&
    !(snapshot.origin_kind === 'incident' && snapshot.incident_id)
  )
    throw new Error('El origen aceptado del trabajo está incompleto.')
  const { data: history, error: historyError } = await db
    .from('work_order_events')
    .select('id,kind,payload,occurred_at')
    .eq('tenant_id', tenantId)
    .eq('work_order_id', workOrderId)
    .order('occurred_at', { ascending: false })
    .limit(50)
  if (historyError) throw new Error(historyError.message)
  const { source_snapshot: _snapshot, ...row } = data
  return {
    ...(row as WorkOrder),
    originKind: snapshot.origin_kind ?? 'estimate',
    originIncidentId: snapshot.origin_kind === 'incident' ? (snapshot.incident_id ?? null) : null,
    scope: snapshot.estimate ? estimateFromRow(snapshot.estimate) : null,
    customerName: snapshot.client?.name ?? '',
    locationName: snapshot.location?.name ?? null,
    acceptance: snapshot.acceptance ?? null,
    publicationSource: snapshot.estimate ? (snapshot.publication_source ?? 'migration') : null,
    events: (history ?? []) as WorkOrderEvent[],
  } satisfies WorkOrderDetail
}

export type WorkTargetOptions = {
  locations: Array<{ id: string; name: string; address: string; timezone: string }>
}

export async function loadWorkTargetOptions(
  tenantId: string,
  clientId: string,
): Promise<WorkTargetOptions> {
  const db = createBrowserSupabaseClient()
  const { data: locations, error: locationError } = await db
    .from('service_locations')
    .select('id,name,address,timezone')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .eq('active', true)
    .order('name')
  if (locationError) throw new Error(locationError.message)
  return { locations: locations ?? [] }
}

export type WorkMemberOption = { id: string; label: string }

export async function loadWorkMemberOptions(tenantId: string): Promise<WorkMemberOption[]> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('memberships')
    .select('user_id,profiles(email,full_name)')
    .eq('tenant_id', tenantId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
      id: row.user_id as string,
      label: profile?.full_name || profile?.email || String(row.user_id),
    }
  })
}

export async function updateWorkOrderPlan(input: {
  tenantId: string
  workOrder: WorkOrder
  responsibleUserId: string | null
  workTeamId: string | null
  plannedStartAt: string | null
  plannedEndAt: string | null
  description: string
  operationId: string
}): Promise<void> {
  const { error } = await createBrowserSupabaseClient().rpc('plan_work_order', {
    p_tenant_id: input.tenantId,
    p_work_order_id: input.workOrder.id,
    p_expected_updated_at: input.workOrder.updated_at,
    p_responsible_user_id: input.responsibleUserId,
    p_work_team_id: input.workTeamId,
    p_planned_start_at: input.plannedStartAt,
    p_planned_end_at: input.plannedEndAt,
    p_description: input.description.trim(),
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
}

export async function convertAcceptedEstimate(
  tenantId: string,
  estimateId: string,
  operationId: string,
): Promise<string> {
  const { data, error } = await createBrowserSupabaseClient().rpc(
    'convert_accepted_estimate_to_work',
    {
      p_tenant_id: tenantId,
      p_estimate_id: estimateId,
      p_operation_id: operationId,
    },
  )
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo crear el trabajo.')
  return data
}

export async function transitionWorkOrder(
  tenantId: string,
  workOrder: WorkOrder,
  nextStatus: WorkOrderStatus,
  operationId: string,
): Promise<void> {
  const { error } = await createBrowserSupabaseClient().rpc('transition_work_order', {
    p_tenant_id: tenantId,
    p_work_order_id: workOrder.id,
    p_expected_updated_at: workOrder.updated_at,
    p_next_status: nextStatus,
    p_operation_id: operationId,
  })
  if (error) throw new Error(error.message)
}
