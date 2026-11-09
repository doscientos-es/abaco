import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { VacationRequest, VacationRequestStatus } from '../domain/vacation-request'

type VacationRequestRow = {
  id: string
  requester_id: string
  requester_name: string
  start_date: string
  end_date: string
  requester_comment: string
  status: VacationRequestStatus
  submitted_at: string
  decision_comment: string
  decided_at: string | null
  decided_by_name: string
}

function toVacationRequest(row: VacationRequestRow): VacationRequest {
  return {
    id: row.id,
    requesterId: row.requester_id,
    requesterName: row.requester_name,
    startDate: row.start_date,
    endDate: row.end_date,
    comment: row.requester_comment,
    status: row.status,
    submittedAt: row.submitted_at,
    decisionComment: row.decision_comment,
    decidedAt: row.decided_at,
    decidedByName: row.decided_by_name,
  }
}

export async function listVacationRequests(tenantId: string): Promise<VacationRequest[]> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('vacation_requests')
    .select(
      'id, requester_id, requester_name, start_date, end_date, requester_comment, status, submitted_at, decision_comment, decided_at, decided_by_name',
    )
    .eq('tenant_id', tenantId)
    .order('submitted_at', { ascending: false })
  if (error) throw new Error('No se pudieron cargar las solicitudes de vacaciones.')
  return ((data ?? []) as VacationRequestRow[]).map(toVacationRequest)
}

export async function submitVacationRequest(input: {
  tenantId: string
  startDate: string
  endDate: string
  comment: string
}): Promise<string> {
  const { data, error } = await createBrowserSupabaseClient().rpc('submit_vacation_request', {
    p_tenant_id: input.tenantId,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_comment: input.comment.trim(),
  })
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo enviar la solicitud.')
  return data
}

export async function decideVacationRequest(input: {
  tenantId: string
  requestId: string
  decision: Extract<VacationRequestStatus, 'approved' | 'rejected'>
  comment: string
}): Promise<string> {
  const { data, error } = await createBrowserSupabaseClient().rpc('decide_vacation_request', {
    p_tenant_id: input.tenantId,
    p_request_id: input.requestId,
    p_decision: input.decision,
    p_comment: input.comment.trim(),
  })
  if (error || typeof data !== 'string')
    throw new Error(error?.message ?? 'No se pudo guardar la decisión.')
  return data
}
