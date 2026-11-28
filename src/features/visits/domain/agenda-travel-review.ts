import type { VisitSummary } from '../application/visit-actions'
import { localVisitDay } from './next-assigned-visit'

export const maxTravelStops = 20
export const maxTravelMinutes = 720

type RouteVisit = Pick<
  VisitSummary,
  | 'id'
  | 'title'
  | 'status'
  | 'timezone'
  | 'scheduled_start_at'
  | 'scheduled_end_at'
  | 'route_order'
  | 'assigned_user_id'
  | 'assigned_user_name'
  | 'work_team_id'
  | 'work_team_name'
>

export type TravelStop = {
  id: string
  title: string
  startsAt: string
  endsAt: string
  timezone: string
  routeOrder: number
}
export type TravelRoute = { id: string; name: string; stops: TravelStop[] }

function assignment(visit: RouteVisit) {
  // A personal route must not be merged with unassigned team work or other technicians in its team.
  if (visit.assigned_user_id)
    return {
      id: `person:${visit.assigned_user_id}`,
      name: visit.assigned_user_name?.trim() || 'Técnico asignado',
    }
  if (visit.work_team_id)
    return {
      id: `team:${visit.work_team_id}`,
      name: visit.work_team_name?.trim() || 'Equipo asignado',
    }
  return null
}

export function dailyTravelRoutes(visits: readonly RouteVisit[], date: string) {
  const groups = new Map<string, TravelRoute>()
  for (const visit of visits) {
    if (visit.status !== 'scheduled') continue
    const route = assignment(visit)
    if (!route) continue
    const start = Date.parse(visit.scheduled_start_at)
    const end = Date.parse(visit.scheduled_end_at)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    try {
      if (localVisitDay(visit) !== date) continue
    } catch {
      continue
    }
    const group = groups.get(route.id) ?? { ...route, stops: [] }
    group.stops.push({
      id: visit.id,
      title: visit.title,
      startsAt: visit.scheduled_start_at,
      endsAt: visit.scheduled_end_at,
      timezone: visit.timezone,
      routeOrder: visit.route_order ?? 0,
    })
    groups.set(route.id, group)
  }
  return [...groups.values()]
    .filter(({ stops }) => stops.length > 1)
    .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id))
    .map((group) => ({
      ...group,
      stops: group.stops.sort(
        (a, b) =>
          a.routeOrder - b.routeOrder ||
          Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
          a.id.localeCompare(b.id),
      ),
    }))
}

export function selectedTravelLegs(stops: readonly TravelStop[], selected: ReadonlySet<string>) {
  const included = stops.flatMap((stop, index) => (selected.has(stop.id) ? [{ stop, index }] : []))
  return included.slice(1).flatMap(({ stop, index }, legIndex) => {
    const previous = included[legIndex]
    if (!previous) return []
    return [
      {
        id: `${previous.stop.id}:${stop.id}`,
        from: previous.stop,
        to: stop,
        omitted: index - previous.index - 1,
        gapMinutes: (Date.parse(stop.startsAt) - Date.parse(previous.stop.endsAt)) / 60_000,
      },
    ]
  })
}

export function manualTravelMinutes(value: string | undefined): number | null {
  if (!value || !/^\d{1,3}$/.test(value)) return null
  const minutes = Number(value)
  return minutes <= maxTravelMinutes ? minutes : null
}

export function travelLegMargin(gapMinutes: number, estimate: number | null) {
  if (gapMinutes < 0) return { status: 'overlap', minutes: -gapMinutes } as const
  if (estimate === null) return { status: 'unknown', minutes: gapMinutes } as const
  const difference = gapMinutes - estimate
  if (difference < 0) return { status: 'short', minutes: -difference } as const
  if (difference < 1) return { status: 'tight', minutes: difference } as const
  return { status: 'spare', minutes: difference } as const
}
