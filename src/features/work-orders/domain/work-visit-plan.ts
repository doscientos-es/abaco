import type { WorkVisit } from '@/features/visits/application/visit-actions'

export function visitDay(visit: WorkVisit): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: visit.timezone }).format(
    new Date(visit.scheduled_start_at),
  )
}

/** Never cancel visits already started or completed, or another visit on the same day. */
export function workVisitChanges(visits: WorkVisit[], selectedDays: string[]) {
  const selected = new Set(selectedDays)
  const occupied = new Set(visits.map(visitDay))
  const locked = new Set(visits.filter((visit) => visit.status !== 'scheduled').map(visitDay))
  return {
    add: [...selected].filter((day) => !occupied.has(day)).sort(),
    cancel: visits.filter(
      (visit) =>
        visit.status === 'scheduled' &&
        !selected.has(visitDay(visit)) &&
        !locked.has(visitDay(visit)),
    ),
    locked: [...locked],
  }
}
