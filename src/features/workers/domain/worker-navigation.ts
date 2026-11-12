import { z } from 'zod'

export const workerViews = [
  'personas',
  'equipos',
  'horarios',
  'vacaciones',
  'organigrama',
  'funciones',
] as const
export type WorkerView = (typeof workerViews)[number]
export type WorkersSearch = { vista?: WorkerView; equipo?: string; persona?: string }

/** Invalid or stale links must not silently broaden a selected team to the company. */
export function validateWorkersSearch(search: Record<string, unknown>): WorkersSearch {
  const vista = workerViews.find((view) => view === search.vista)
  const person = z.string().uuid().safeParse(search.persona)
  const team = z.string().uuid().safeParse(search.equipo)
  return {
    ...(vista ? { vista } : {}),
    ...(person.success ? { persona: person.data } : team.success ? { equipo: team.data } : {}),
  }
}
