import type { VisitSummary } from '../application/visit-actions'

/** Match the assigned-visits RPC: the day belongs to the visit's location, not the browser. */
export function localVisitDay(visit: Pick<VisitSummary, 'scheduled_start_at' | 'timezone'>) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: visit.timezone }).format(
    new Date(visit.scheduled_start_at),
  )
}

export function nextAssignedVisit(visits: readonly VisitSummary[], now: number) {
  return visits
    .filter(
      ({ status, scheduled_end_at }) =>
        status === 'scheduled' && Date.parse(scheduled_end_at) > now,
    )
    .sort(
      (left, right) =>
        Date.parse(left.scheduled_start_at) - Date.parse(right.scheduled_start_at) ||
        left.id.localeCompare(right.id),
    )[0]
}
