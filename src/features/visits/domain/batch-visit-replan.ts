import type { VacationDateRange } from '@/features/vacations/domain/vacation-conflict'
import type { WorkTeam } from '@/features/work-teams/domain/work-team'
import { moveDays } from '@/shared/lib/date-range'

import type { VisitSummary } from '../application/visit-actions'

const minute = 60_000
const day = 24 * 60 * minute
export const maxBatchVisits = 20
export const maxShiftMinutes = 7 * 24 * 60

type Interval = { start: number; end: number }

export type BatchVisitSlot = {
  visit: VisitSummary
  current: Interval
  target: Interval | null
  oldLocal: string
  newLocal: string
  durationMinutes: number
  blockers: string[]
  dependsOn: string[]
}

export type BatchVisitProposal = {
  slots: BatchVisitSlot[]
  sequence: string[]
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function localStamp(instant: number, timeZone: string) {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone,
      calendar: 'iso8601',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter.format(new Date(instant)).replace(' ', 'T')
}

function timeOfLocalStamp(value: string) {
  return Date.parse(`${value}:00Z`)
}

/** Use offsets on either side of the desired date, not the browser's own timezone. */
function resolveLocalTime(stamp: string, timezone: string) {
  const wall = timeOfLocalStamp(stamp)
  const offsets = new Set(
    [-2, -1, 0, 1, 2].map((offset) => {
      const sample = wall + offset * day
      return timeOfLocalStamp(localStamp(sample, timezone)) - sample
    }),
  )
  const matches = [...offsets]
    .map((offset) => wall - offset)
    .filter((candidate) => localStamp(candidate, timezone) === stamp)
  return matches.length === 1 ? matches[0] : undefined
}

export function proposeVisitShift(visit: VisitSummary, shiftMinutes: number): BatchVisitSlot {
  const current = {
    start: Date.parse(visit.scheduled_start_at),
    end: Date.parse(visit.scheduled_end_at),
  }
  const durationMinutes = (current.end - current.start) / minute
  const row: BatchVisitSlot = {
    visit,
    current,
    durationMinutes,
    oldLocal: '',
    newLocal: '',
    target: null,
    blockers: [],
    dependsOn: [],
  }
  if (
    visit.status !== 'scheduled' ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 15 ||
    durationMinutes > 720 ||
    !Number.isInteger(shiftMinutes) ||
    !shiftMinutes ||
    Math.abs(shiftMinutes) > maxShiftMinutes
  ) {
    row.blockers.push('Esta visita o el desplazamiento no admiten el cambio.')
    return row
  }
  try {
    row.oldLocal = localStamp(current.start, visit.timezone)
    row.newLocal = new Date(timeOfLocalStamp(row.oldLocal) + shiftMinutes * minute)
      .toISOString()
      .slice(0, 16)
    const newStart = resolveLocalTime(row.newLocal, visit.timezone)
    if (newStart === undefined) row.blockers.push('Hora ambigua o inexistente por cambio horario.')
    else if (newStart === current.start) row.blockers.push('El horario coincide con el actual.')
    else row.target = { start: newStart, end: newStart + durationMinutes * minute }
  } catch {
    row.blockers.push('No se pudo comprobar la fecha o la zona horaria.')
  }
  return row
}

/** SQL agenda filtering uses the location's date rather than UTC; fetch an expanded range. */
export function batchAgendaRange(slots: BatchVisitSlot[]) {
  const timestamps = slots
    .flatMap(({ current, target }) => [current.start, current.end, target?.start, target?.end])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b)
  const first = timestamps[0]
  const last = timestamps.at(-1)
  if (first === undefined || last === undefined) return null
  return {
    from: moveDays(new Date(first).toISOString().slice(0, 10), -2),
    to: moveDays(new Date(last).toISOString().slice(0, 10), 2),
  }
}

function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && b.start < a.end
}

function sharedMember(a: Set<string>, b: Set<string>) {
  return [...a].some((person) => b.has(person))
}

export function evaluateVisitBatch(
  preliminary: BatchVisitSlot[],
  all: VisitSummary[],
  teams: WorkTeam[],
  absences: VacationDateRange[],
): BatchVisitProposal {
  const slots = preliminary.map((slot) => ({
    ...slot,
    blockers: [...slot.blockers],
    dependsOn: [] as string[],
  }))
  const selected = new Map(slots.map((slot) => [slot.visit.id, slot]))
  const byId = new Map(all.map((visit) => [visit.id, visit]))
  const teamsById = new Map(teams.map((team) => [team.id, team]))
  function peopleOf(visit: VisitSummary): Set<string> | null {
    if (visit.work_team_id) {
      const team = teamsById.get(visit.work_team_id)
      return team?.memberIds.length ? new Set(team.memberIds) : null
    }
    if (visit.assigned_user_id) return new Set([visit.assigned_user_id])
    if (visit.work_team_id === null && visit.assigned_user_id === null) return new Set()
    return null
  }
  const active = all
    .filter((visit) => visit.status === 'scheduled' || visit.status === 'in_progress')
    .map((visit) => ({
      visit,
      people: peopleOf(visit),
      slot: {
        start: Date.parse(visit.scheduled_start_at),
        end: Date.parse(visit.scheduled_end_at),
      },
    }))
  const selectedPeople = new Map(slots.map(({ visit }) => [visit.id, peopleOf(visit)]))

  for (const slot of slots) {
    const { visit, target } = slot
    if (!target) continue
    const reloaded = byId.get(visit.id)
    if (
      reloaded?.status !== 'scheduled' ||
      reloaded.updated_at !== visit.updated_at ||
      reloaded.assigned_user_id !== visit.assigned_user_id ||
      reloaded.work_team_id !== visit.work_team_id ||
      reloaded.timezone !== visit.timezone ||
      reloaded.scheduled_start_at !== visit.scheduled_start_at ||
      reloaded.scheduled_end_at !== visit.scheduled_end_at
    ) {
      slot.blockers.push('La visita ha cambiado. Recarga la agenda y prepara otra propuesta.')
      continue
    }
    const people = selectedPeople.get(visit.id)
    if (!people || (visit.work_team_id && teamsById.get(visit.work_team_id)?.archived)) {
      slot.blockers.push('No se pudo comprobar que la asignación actual esté disponible.')
      continue
    }
    if (!people.size) continue
    const firstDay = slot.newLocal.slice(0, 10)
    const lastDay = localStamp(target.end - 1, visit.timezone).slice(0, 10)
    if (
      absences.some(
        ({ userId, startDate, endDate }) =>
          people.has(userId) && startDate <= lastDay && (endDate === null || endDate >= firstDay),
      )
    ) {
      slot.blockers.push('Una persona asignada tiene una ausencia aprobada en el nuevo horario.')
    }
    for (const other of active) {
      if (other.visit.id === visit.id || !overlaps(target, other.slot)) continue
      if (!other.people) {
        slot.blockers.push(`No se pudo comprobar la asignación de «${other.visit.title}».`)
        continue
      }
      if (!sharedMember(people, other.people)) continue
      if (selected.has(other.visit.id)) slot.dependsOn.push(other.visit.id)
      else slot.blockers.push(`Coincide con «${other.visit.title}» en la agenda actual.`)
    }
    for (const other of slots) {
      if (other.visit.id === visit.id || !other.target || !overlaps(target, other.target)) continue
      const otherPeople = selectedPeople.get(other.visit.id)
      if (otherPeople && sharedMember(people, otherPeople)) {
        slot.blockers.push(`Coincide con la propuesta de «${other.visit.title}».`)
      }
    }
  }

  if (slots.some(({ blockers }) => blockers.length)) return { slots, sequence: [] }
  const sequence: string[] = []
  const remaining = new Map(slots.map((slot) => [slot.visit.id, slot]))
  while (remaining.size) {
    const available = [...remaining.values()].find(({ dependsOn }) =>
      dependsOn.every((id) => !remaining.has(id)),
    )
    if (!available) {
      for (const slot of remaining.values()) {
        slot.blockers.push('Los horarios se bloquean entre sí. Cambia la propuesta.')
      }
      return { slots, sequence: [] }
    }
    remaining.delete(available.visit.id)
    sequence.push(available.visit.id)
  }
  return { slots, sequence }
}
