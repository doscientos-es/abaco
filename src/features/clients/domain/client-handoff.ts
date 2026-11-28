import { calendarDate, todayInMadrid } from '@/shared/lib/date-range'

export type HandoffVisit = {
  title: string
  location_id: string | null
  scheduled_start_at: string
  actual_start_at: string | null
  actual_end_at: string | null
  performed_on: string | null
}
export type HandoffIncidentStatus = 'open' | 'in_progress' | 'reopened'
export type HandoffIncident = {
  id: string
  title: string
  location_id: string | null
  status: HandoffIncidentStatus
  due_at: string | null
  updated_at: string
}
export type HandoffTiming = {
  last: HandoffVisit | null
  active: HandoffVisit | null
  next: HandoffVisit | null
}
export const handoffPendingLimit = 5
export const handoffIncidentStatuses: Record<HandoffIncidentStatus, string> = {
  open: 'Abierta',
  in_progress: 'En curso',
  reopened: 'Reabierta',
}

const dateOnly = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' })
const madridDateTime = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function latestHandoffVisit(
  paper: HandoffVisit | null,
  app: HandoffVisit | null,
  undated: HandoffVisit | null,
) {
  if (!paper?.performed_on) return app ?? undated
  if (!app?.actual_end_at) return paper
  // Paper gives a service day, not a time. Prefer the real closing timestamp on a same-day tie.
  return paper.performed_on > todayInMadrid(new Date(app.actual_end_at)) ? paper : app
}

export function handoffInstant(value: string) {
  return madridDateTime.format(new Date(value))
}

export function handoffRecordedDay(value: string) {
  return dateOnly.format(calendarDate(value))
}

export function handoffLocationName(
  locationId: string | null,
  locations: readonly { id: string; name: string }[],
) {
  return locationId
    ? (locations.find(({ id }) => id === locationId)?.name ?? 'Centro no disponible')
    : 'Sin centro asignado'
}
