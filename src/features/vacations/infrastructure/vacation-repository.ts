import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type {
  AbsenceType,
  VacationRequest,
  VacationRequestStatus,
} from '../domain/vacation-request'

type VacationRequestRow = {
  id: string
  requester_id: string
  requester_name: string
  absence_type: AbsenceType
  start_date: string
  end_date: string | null
  requester_comment: string
  status: VacationRequestStatus
  submitted_at: string
  decision_comment: string
  decided_at: string | null
  decided_by_name: string
}

export type ApprovedVacationRange = {
  userId: string
  startDate: string
  endDate: string | null
}

export type VacationCoverageCandidate = {
  userId: string
  label: string
  workTeamMatch: boolean
}

export type VacationAffectedVisit = {
  visitId: string
  title: string
  clientName: string
  locationName: string
  address: string
  timezone: string
  assignedUserId: string
  assignedUserName: string
  scheduledStartAt: string
  scheduledEndAt: string
  status: 'scheduled' | 'in_progress'
  updatedAt: string
  workTeamName: string | null
  candidates: VacationCoverageCandidate[]
}

type VacationCoverageRow = {
  visit_id: string
  title: string
  client_name: string
  location_name: string
  address: string
  timezone: string
  assigned_user_id: string
  assigned_user_name: string
  scheduled_start_at: string
  scheduled_end_at: string
  status: 'scheduled' | 'in_progress'
  updated_at: string
  work_team_name: string | null
  candidates: unknown
}

function toVacationRequest(row: VacationRequestRow): VacationRequest {
  return {
    id: row.id,
    requesterId: row.requester_id,
    requesterName: row.requester_name,
    absenceType: row.absence_type ?? 'vacation',
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
    .from('absence_requests')
    .select(
      'id, requester_id, requester_name, absence_type, start_date, end_date, requester_comment, status, submitted_at, decision_comment, decided_at, decided_by_name',
    )
    .eq('tenant_id', tenantId)
    .order('submitted_at', { ascending: false })
  if (error) throw new Error('No se pudieron cargar las solicitudes de vacaciones.')
  return ((data ?? []) as VacationRequestRow[]).map(toVacationRequest)
}

export async function listApprovedVacationRanges(
  tenantId: string,
  from: string,
  to: string,
): Promise<ApprovedVacationRange[]> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('absence_requests')
    .select('requester_id, start_date, end_date')
    .eq('tenant_id', tenantId)
    .eq('status', 'approved')
    .in('absence_type', ['vacation', 'sick_leave'])
    .lte('start_date', to)
    .or(`end_date.is.null,end_date.gte.${from}`)
  if (error) throw new Error('No se pudieron cargar las ausencias aprobadas.')
  return (data ?? []).map((row) => ({
    userId: row.requester_id,
    startDate: row.start_date,
    endDate: row.end_date,
  }))
}

export async function listVacationCoverage(
  tenantId: string,
  requestId: string,
): Promise<VacationAffectedVisit[]> {
  const { data, error } = await createBrowserSupabaseClient().rpc('list_vacation_coverage', {
    p_tenant_id: tenantId,
    p_request_id: requestId,
  })
  if (error) throw new Error('No se pudieron cargar los servicios afectados.')
  const rows = (data ?? []) as unknown as VacationCoverageRow[]
  return rows.map((row) => ({
    visitId: row.visit_id,
    title: row.title,
    clientName: row.client_name,
    locationName: row.location_name,
    address: row.address,
    timezone: row.timezone,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name,
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    status: row.status,
    updatedAt: row.updated_at,
    workTeamName: row.work_team_name,
    candidates: Array.isArray(row.candidates)
      ? row.candidates.map((candidate: Record<string, unknown>) => ({
          userId: String(candidate.userId),
          label: String(candidate.label),
          workTeamMatch: candidate.workTeamMatch === true,
        }))
      : [],
  }))
}

export async function submitVacationRequest(input: {
  tenantId: string
  absenceType?: AbsenceType
  startDate: string
  endDate: string | null
  comment: string
}): Promise<string> {
  const { data, error } = await createBrowserSupabaseClient().rpc('submit_absence_request', {
    p_tenant_id: input.tenantId,
    p_absence_type: input.absenceType ?? 'vacation',
    p_start_date: input.startDate,
    p_end_date: input.endDate || null,
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
