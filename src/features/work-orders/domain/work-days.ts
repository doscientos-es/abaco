import type { VisitStatus } from '@/features/visits/application/visit-actions'

export type WorkDayVisit = {
  id: string
  scheduled_start_at: string
  status: VisitStatus
  updated_at: string
  service_locations: { timezone: string } | { timezone: string }[] | null
}

export function workVisitDay(visit: WorkDayVisit): string {
  const location = Array.isArray(visit.service_locations)
    ? visit.service_locations[0]
    : visit.service_locations
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: location?.timezone ?? 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(visit.scheduled_start_at))
}

export function workDayChanges(visits: WorkDayVisit[], selectedDays: string[]) {
  const selected = new Set(selectedDays)
  const existing = new Set(visits.map(workVisitDay))
  const removed = visits.filter((visit) => !selected.has(workVisitDay(visit)))
  if (removed.some((visit) => visit.status !== 'scheduled'))
    throw new Error('No se pueden quitar días con visitas iniciadas o finalizadas.')
  return {
    add: [...selected].filter((day) => !existing.has(day)).sort(),
    remove: removed,
  }
}
