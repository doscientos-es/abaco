/** Application boundary for the office agenda and assigned technician visits. */
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
