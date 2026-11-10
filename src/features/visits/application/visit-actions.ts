/** Application boundary for the office agenda and assigned technician visits. */
import { moveDays } from '@/shared/lib/date-range'

import { listOfficeVisits } from '../infrastructure/visit-repository'

const officeVisitsPageSize = 50
const maxOfficeVisitsPage = 10_000

export async function listAllOfficeVisits(
  tenantId: string,
  from: string,
  to: string,
  assignedUserId: string | null,
) {
  const visits = []
  for (let page = 0; page <= maxOfficeVisitsPage; page += 1) {
    const batch = await listOfficeVisits(tenantId, from, to, assignedUserId, page)
    visits.push(...batch)
    if (batch.length < officeVisitsPageSize) return visits
  }
  throw new Error('La agenda supera el máximo de visitas que se pueden cargar.')
}

/** Includes overnight carry-over; the RPC filters by start day and accepts at most 31-day spans. */
export async function listPlanningVisits(
  tenantId: string,
  from: string,
  to: string,
  assignedUserId: string | null,
) {
  if (from > to) throw new Error('Rango de planificación inválido.')
  const visits = []
  // Visits have a maximum duration of 720 minutes, so one previous day is sufficient.
  for (let start = moveDays(from, -1); start <= to;) {
    const end = moveDays(start, 30) < to ? moveDays(start, 30) : to
    visits.push(...(await listAllOfficeVisits(tenantId, start, end, assignedUserId)))
    start = moveDays(end, 1)
  }
  return visits.filter((visit) => {
    const format = new Intl.DateTimeFormat('sv-SE', {
      timeZone: visit.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const start = format.format(new Date(visit.scheduled_start_at))
    const lastOccupiedDay = format.format(new Date(Date.parse(visit.scheduled_end_at) - 1))
    return start <= to && lastOccupiedDay >= from
  })
}

export {
  createServiceVisit,
  listMyVisits,
  listOfficeVisits,
  listTechnicians,
  replanServiceVisit,
  transitionServiceVisit,
} from '../infrastructure/visit-repository'
export type {
  TechnicianOption,
  VisitPriority,
  VisitStatus,
  VisitSummary,
} from '../infrastructure/visit-repository'
