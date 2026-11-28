import { scheduleError } from '@/features/staff-schedules/domain/staff-schedule'
import { moveDays, todayInMadrid } from '@/shared/lib/date-range'

import type { TeamCalendarRow } from './team-calendar'

const hour = 3_600_000

type Interval = { start: number; end: number }
type Team = { id: string; memberIds: string[] }

export type WeeklyCapacityVisit = {
  id: string
  scheduled_start_at: string
  scheduled_end_at: string
  status: string
  assigned_user_id: string | null
  work_team_id: string | null
}

export const loadStatuses = ['scheduled', 'in_progress', 'completed'] as const

function madridMidnight(day: string) {
  const utc = Date.parse(`${day}T00:00:00Z`)
  if (!Number.isFinite(utc)) return null
  let lower = utc - 12 * hour
  let upper = utc + 12 * hour
  // Locate the civil boundary in the same time zone as the team calendar.
  while (upper - lower > 1) {
    const middle = Math.floor((upper + lower) / 2)
    if (todayInMadrid(new Date(middle)) < day) lower = middle
    else upper = middle
  }
  return upper
}

export function weeklyCapacityBounds(from: string, to: string): Interval | null {
  const start = madridMidnight(from)
  const end = madridMidnight(moveDays(to, 1))
  return start !== null && end !== null && start < end ? { start, end } : null
}

function configuredMinutes(row: TeamCalendarRow): number | null {
  if (row.cells.length !== 7) return null
  if (row.cells.every((cell) => cell.approved)) return 0
  const shifts = row.cells.flatMap((cell) => cell.plannedSlots ?? [])
  if (
    !shifts.length ||
    row.cells.some((cell) => cell.plannedSlots === null) ||
    scheduleError(shifts)
  )
    return null
  return row.cells.reduce(
    (total, cell) =>
      total +
      (cell.approved
        ? 0
        : (cell.plannedSlots ?? []).reduce((sum, slot) => sum + slot.end - slot.start, 0)),
    0,
  )
}

function loadMinutes(intervals: Interval[]) {
  let duration = 0
  let overlap = 0
  let latest = -Infinity
  for (const interval of intervals.sort((a, b) => a.start - b.start || a.end - b.end)) {
    duration += interval.end - interval.start
    overlap += Math.max(0, Math.min(latest, interval.end) - interval.start)
    latest = Math.max(latest, interval.end)
  }
  return { planned: duration / 60_000, overlap: overlap / 60_000 }
}

/** Planned workload in person-minutes. A team appointment occupies every member in the scope. */
export function projectWeeklyCapacity({
  rows,
  companyPersonIds,
  teams,
  visits,
  bounds,
}: {
  rows: TeamCalendarRow[]
  companyPersonIds: string[]
  teams: Team[]
  visits: WeeklyCapacityVisit[]
  bounds: Interval
}) {
  const allPeople = new Set(companyPersonIds)
  const loadByPerson = new Map(rows.map((row) => [row.userId, [] as Interval[]]))
  const teamsById = new Map(teams.map((team) => [team.id, team]))
  const countedVisits = new Set<string>()
  let unassignedMinutes = 0
  let unassignedVisits = 0
  let unknownVisits = 0

  for (const visit of visits) {
    if (!loadStatuses.some((status) => status === visit.status) || countedVisits.has(visit.id))
      continue
    countedVisits.add(visit.id)
    const start = Math.max(Date.parse(visit.scheduled_start_at), bounds.start)
    const end = Math.min(Date.parse(visit.scheduled_end_at), bounds.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      unknownVisits += 1
      continue
    }
    if (end <= start) continue

    if (visit.assigned_user_id === null && visit.work_team_id === null) {
      unassignedVisits += 1
      unassignedMinutes += (end - start) / 60_000
      continue
    }
    const team = visit.work_team_id ? teamsById.get(visit.work_team_id) : undefined
    const people = new Set(team?.memberIds ?? [])
    if (visit.assigned_user_id) people.add(visit.assigned_user_id)
    if (
      (visit.work_team_id !== null && !team?.memberIds.length) ||
      visit.assigned_user_id === undefined ||
      [...people].some((id) => !allPeople.has(id))
    )
      unknownVisits += 1
    for (const id of people) loadByPerson.get(id)?.push({ start, end })
  }

  const people = rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    capacity: configuredMinutes(row),
    ...loadMinutes(loadByPerson.get(row.userId) ?? []),
  }))
  return {
    people,
    capacity: people.reduce((total, person) => total + (person.capacity ?? 0), 0),
    planned: people.reduce((total, person) => total + person.planned, 0),
    overlap: people.reduce((total, person) => total + person.overlap, 0),
    unknownSchedules: people.filter((person) => person.capacity === null).length,
    pendingRequests: rows.filter((row) => row.cells.some((cell) => cell.pending)).length,
    unassignedVisits,
    unassignedMinutes,
    unknownVisits,
    daylightSavingWeek: bounds.end - bounds.start !== 168 * hour,
  }
}
