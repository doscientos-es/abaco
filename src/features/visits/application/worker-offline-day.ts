import { listMyVisits, type VisitSummary } from './visit-actions'
import {
  loadVisitReport,
  requireVisitReportActor,
  type VisitReportData,
} from './visit-report-actions'

export const maxOfflineDayVisits = 20

export type OfflineReportBase = {
  revision: number
  data: VisitReportData | null
}

export type PreparedWorkerDay = {
  date: string
  scope: string
  visits: VisitSummary[]
  reports: Map<string, OfflineReportBase>
}

function minimizeVisit(visit: VisitSummary): VisitSummary {
  return {
    id: visit.id,
    title: visit.title,
    client_name: '',
    location_name: '',
    address: '',
    notes: '',
    timezone: visit.timezone,
    scheduled_start_at: visit.scheduled_start_at,
    scheduled_end_at: visit.scheduled_end_at,
    status: visit.status,
    priority: visit.priority,
    updated_at: visit.updated_at,
  }
}

export async function prepareWorkerDay(
  tenantId: string,
  userId: string,
  date: string,
): Promise<PreparedWorkerDay> {
  await requireVisitReportActor(userId)
  const assigned = (await listMyVisits(tenantId, date, date)).filter(
    ({ status }) => status === 'scheduled' || status === 'in_progress',
  )
  if (assigned.length > maxOfflineDayVisits) {
    throw new Error(
      'Esta jornada supera las 20 visitas abiertas que se pueden preparar en el dispositivo.',
    )
  }
  const reports = new Map<string, OfflineReportBase>()
  // Keep the open-tab snapshot small and limit simultaneous reads. Either all
  // report baselines are available or the download is not marked ready.
  for (let index = 0; index < assigned.length; index += 4) {
    const batch = await Promise.all(
      assigned.slice(index, index + 4).map(async ({ id }) => {
        const report = await loadVisitReport(tenantId, id)
        return [id, { revision: report?.revision ?? 0, data: report?.data ?? null }] as const
      }),
    )
    for (const [id, baseline] of batch) reports.set(id, baseline)
  }
  await requireVisitReportActor(userId)
  return { scope: `${tenantId}:${userId}`, date, visits: assigned.map(minimizeVisit), reports }
}

export async function requireOpenAssignedVisit(tenantId: string, visitId: string, day: string) {
  const assigned = await listMyVisits(tenantId, day, day)
  if (
    !assigned.some(
      ({ id, status }) => id === visitId && (status === 'scheduled' || status === 'in_progress'),
    )
  ) {
    throw new Error(
      'La visita ya no está abierta o asignada en esta fecha. El borrador sigue en el dispositivo.',
    )
  }
}
