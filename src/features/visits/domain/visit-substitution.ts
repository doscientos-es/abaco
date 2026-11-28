import { scheduleError, type StaffSchedule } from '@/features/staff-schedules/domain/staff-schedule'
import {
  visitOverlapsVacation,
  type VacationDateRange,
} from '@/features/vacations/domain/vacation-conflict'
import type { WorkTeam } from '@/features/work-teams/domain/work-team'
import { moveDays } from '@/shared/lib/date-range'

import type { TechnicianOption, VisitSummary } from '../application/visit-actions'

const scheduleTimezone = 'Europe/Madrid'
const dayFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: scheduleTimezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const minuteFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: scheduleTimezone,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
})

export type SubstitutionSlot = {
  id: string
  assigned_user_id: string | null
  work_team_id: string | null
  updated_at: string
  work_order_id: string | null
  work_orders: { work_team_id: string | null } | null
}

type ShiftSegment = { weekday: number; start: number; end: number }

function wallMinute(stamp: number) {
  const [hour, minute] = minuteFormat.format(stamp).split(':').map(Number)
  return (hour ?? 0) * 60 + (minute ?? 0)
}

export function substitutionPeriod(visit: VisitSummary) {
  const start = Date.parse(visit.scheduled_start_at)
  const end = Date.parse(visit.scheduled_end_at)
  const duration = (end - start) / 60_000
  // The existing replan form round-trips whole minutes in the visit's wall time.
  if (
    visit.timezone !== scheduleTimezone ||
    !Number.isInteger(duration) ||
    duration < 15 ||
    duration > 720 ||
    start % 60_000 !== 0
  )
    return null
  const from = dayFormat.format(start)
  const to = dayFormat.format(end - 1)
  const segments: ShiftSegment[] = []
  for (let day = from; day <= to; day = moveDays(day, 1)) {
    const noonUtc = Date.parse(`${day}T12:00:00Z`)
    // Recurring staff shifts are wall-time values with no offset. Avoid transition Sundays.
    if (wallMinute(noonUtc) !== wallMinute(noonUtc - 86_400_000)) return null
    segments.push({
      weekday: new Date(noonUtc).getUTCDay() || 7,
      start: day === from ? wallMinute(start) : 0,
      end: day === to ? wallMinute(end - 1) + 1 : 1440,
    })
  }
  return { from, to, segments }
}

function coversShift(schedule: StaffSchedule, segments: ShiftSegment[]) {
  return segments.every((segment) => {
    const slots = schedule.slots
      .filter((slot) => slot.weekday === segment.weekday)
      .sort((a, b) => a.start - b.start)
    let coveredUntil = segment.start
    for (const slot of slots) {
      if (slot.start > coveredUntil) break
      coveredUntil = Math.max(slot.end, coveredUntil)
      if (coveredUntil >= segment.end) return true
    }
    return false
  })
}

export function visitSubstitutions({
  visit,
  functionId,
  technicians,
  schedules,
  absences,
  teams,
  slots,
}: {
  visit: VisitSummary
  functionId: string
  technicians: TechnicianOption[]
  schedules: StaffSchedule[]
  absences: VacationDateRange[]
  teams: WorkTeam[]
  slots: SubstitutionSlot[]
}) {
  const period = substitutionPeriod(visit)
  const target = slots.find(({ id }) => id === visit.id)
  const assignee = visit.assigned_user_id
  const candidates: TechnicianOption[] = []
  let unknown = 0
  const teamsById = new Map(teams.map((team) => [team.id, team]))
  const overlapsAbsence = (id: string) =>
    absences.some((absence) =>
      visitOverlapsVacation(
        {
          assignedUserId: id,
          startAt: visit.scheduled_start_at,
          endAt: visit.scheduled_end_at,
          timezone: visit.timezone,
        },
        absence,
      ),
    )

  if (
    !functionId ||
    visit.status !== 'scheduled' ||
    !period ||
    !assignee ||
    visit.work_team_id !== null ||
    !target ||
    target.updated_at !== visit.updated_at ||
    target.assigned_user_id !== assignee ||
    target.work_team_id !== null ||
    (target.work_order_id !== null && !target.work_orders) ||
    !overlapsAbsence(assignee)
  )
    return { verified: false as const }

  const requiredTeamId = target.work_orders?.work_team_id
  const requiredTeam = requiredTeamId ? teamsById.get(requiredTeamId) : undefined
  if (requiredTeamId && (!requiredTeam || requiredTeam.archived))
    return { verified: false as const }

  const busy = new Set<string>()
  for (const slot of slots) {
    if (slot.id === visit.id) continue
    if (slot.assigned_user_id) busy.add(slot.assigned_user_id)
    if (slot.work_team_id) {
      const team = teamsById.get(slot.work_team_id)
      if (!team) return { verified: false as const }
      for (const id of team.memberIds) busy.add(id)
    }
  }

  const byUser = new Map(schedules.map((schedule) => [schedule.userId, schedule]))
  const teamMembers = requiredTeam ? new Set(requiredTeam.memberIds) : null
  for (const technician of technicians) {
    const id = technician.id
    if (
      id === assignee ||
      (teamMembers && !teamMembers.has(id)) ||
      busy.has(id) ||
      overlapsAbsence(id)
    )
      continue
    const schedule = byUser.get(id)
    if (!schedule?.slots.length || scheduleError(schedule.slots)) {
      unknown++
      continue
    }
    if (schedule.functionIds.includes(functionId) && coversShift(schedule, period.segments)) {
      candidates.push(technician)
    }
  }
  candidates.sort((a, b) => a.label.localeCompare(b.label, 'es') || a.id.localeCompare(b.id))
  return { verified: true as const, candidates, unknown }
}
