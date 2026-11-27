import { calendarDate, dateValue } from '@/shared/lib/date-range'

export const workerViews = [
  'personas',
  'equipos',
  'calendario',
  'horarios',
  'vacaciones',
  'funciones',
  'documentos',
] as const
export type WorkerView = (typeof workerViews)[number]
export type WorkersSearch = {
  vista?: WorkerView
  equipo?: string
  persona?: string
  fecha?: string
}

/** Invalid or stale links must not silently broaden a selected team to the company. */
export function validateWorkersSearch(search: Record<string, unknown>): WorkersSearch {
  const vista = workerViews.find((view) => view === search.vista)
  const person = typeof search.persona === 'string' && search.persona ? search.persona : undefined
  const team = typeof search.equipo === 'string' && search.equipo ? search.equipo : undefined
  const date = search.fecha
  const validDate =
    vista === 'calendario' &&
    typeof date === 'string' &&
    /^[1-9]\d{3}-\d{2}-\d{2}$/.test(date) &&
    dateValue(calendarDate(date)) === date
  return {
    ...(vista ? { vista } : {}),
    ...(validDate ? { fecha: date } : {}),
    ...(person ? { persona: person } : team ? { equipo: team } : {}),
  }
}
