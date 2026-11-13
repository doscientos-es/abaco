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
  const person = typeof search.persona === 'string' && search.persona ? search.persona : undefined
  const team = typeof search.equipo === 'string' && search.equipo ? search.equipo : undefined
  return {
    ...(vista ? { vista } : {}),
    ...(person ? { persona: person } : team ? { equipo: team } : {}),
  }
}
