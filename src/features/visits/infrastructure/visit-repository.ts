import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type VisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'skipped' | 'canceled'
export type VisitPriority = 'low' | 'normal' | 'high' | 'urgent'

export type VisitSummary = {
  id: string
  title: string
  client_name: string
  location_name: string
  address: string
  timezone: string
  assigned_user_id?: string | null
  assigned_user_name?: string
  scheduled_start_at: string
  scheduled_end_at: string
  status: VisitStatus
  priority: VisitPriority
  notes: string
  updated_at: string
}

export type TechnicianOption = { id: string; label: string }

export async function listTechnicians(tenantId: string): Promise<TechnicianOption[]> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('memberships')
    .select('user_id,profiles(email,full_name)')
    .eq('tenant_id', tenantId)
    .eq('role', 'technician')
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
      id: row.user_id as string,
      label: profile?.full_name || profile?.email || 'Técnico',
    }
  })
}

export async function listOfficeVisits(
  tenantId: string,
  from: string,
  to: string,
  assignedUserId: string | null,
  page: number,
): Promise<VisitSummary[]> {
  const { data, error } = await createBrowserSupabaseClient().rpc('list_office_visits', {
    p_tenant_id: tenantId,
    p_from: from,
    p_to: to,
    p_assigned_user_id: assignedUserId,
    p_page: page,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as VisitSummary[]
}

export async function listMyVisits(
  tenantId: string,
  from: string,
  to: string,
): Promise<VisitSummary[]> {
  const { data, error } = await createBrowserSupabaseClient().rpc('my_assigned_visits', {
    p_tenant_id: tenantId,
    p_from: from,
    p_to: to,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as VisitSummary[]
}

export async function createServiceVisit(input: {
  tenantId: string
  clientId: string
  locationId: string | null
  assetId: string | null
  workOrderId: string | null
  title: string
  assignedUserId: string | null
  localStart: string
  timezone: string
  durationMinutes: number
  priority: VisitPriority
  notes: string
  operationId: string
}): Promise<string> {
  const { data, error } = await createBrowserSupabaseClient().rpc('create_service_visit_local', {
    p_tenant_id: input.tenantId,
    p_client_id: input.clientId,
    p_location_id: input.locationId,
    p_asset_id: input.assetId,
    p_work_order_id: input.workOrderId,
    p_title: input.title.trim(),
    p_assigned_user_id: input.assignedUserId,
    p_local_start: input.localStart,
    p_timezone: input.timezone,
    p_duration_minutes: input.durationMinutes,
    p_priority: input.priority,
    p_notes: input.notes.trim(),
    p_operation_id: input.operationId,
  })
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo planificar la visita.')
  return data
}

export async function transitionServiceVisit(input: {
  tenantId: string
  visitId: string
  expectedUpdatedAt: string
  nextStatus: Exclude<VisitStatus, 'scheduled'>
  reason: string
  operationId: string
}): Promise<void> {
  const { error } = await createBrowserSupabaseClient().rpc('transition_service_visit', {
    p_tenant_id: input.tenantId,
    p_visit_id: input.visitId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_next_status: input.nextStatus,
    p_reason: input.reason.trim(),
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
}

export async function replanServiceVisit(input: {
  tenantId: string
  visitId: string
  expectedUpdatedAt: string
  localStart: string
  durationMinutes: number
  assignedUserId: string | null
  reason: string
  operationId: string
}): Promise<void> {
  const { error } = await createBrowserSupabaseClient().rpc('replan_service_visit_local', {
    p_tenant_id: input.tenantId,
    p_visit_id: input.visitId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_local_start: input.localStart,
    p_duration_minutes: input.durationMinutes,
    p_assigned_user_id: input.assignedUserId,
    p_reason: input.reason.trim(),
    p_operation_id: input.operationId,
  })
  if (error) throw new Error(error.message)
}
