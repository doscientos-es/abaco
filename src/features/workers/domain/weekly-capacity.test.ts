import { describe, expect, it } from 'vitest'

import type { TeamCalendarCell, TeamCalendarRow } from './team-calendar'
import {
  projectWeeklyCapacity,
  weeklyCapacityBounds,
  type WeeklyCapacityVisit,
} from './weekly-capacity'

const from = '2026-11-23'
const to = '2026-11-29'
const bounds = weeklyCapacityBounds(from, to) ?? { start: 0, end: 0 }
const row = (
  userId: string,
  overrides?: Record<number, Partial<TeamCalendarCell>>,
): TeamCalendarRow => ({
  name: userId,
  userId,
  cells: Array.from({ length: 7 }, (_, i) => ({
    plannedSlots: i < 5 ? [{ weekday: i + 1, start: 540, end: 780 }] : [],
    approved: false,
    pending: false,
    ...overrides?.[i],
  })),
})
const visit = (id: string, overrides?: Partial<WeeklyCapacityVisit>): WeeklyCapacityVisit => ({
  id,
  status: 'scheduled',
  scheduled_start_at: '2026-11-23T08:30:00Z',
  scheduled_end_at: '2026-11-23T09:30:00Z',
  assigned_user_id: 'ana',
  work_team_id: null,
  ...overrides,
})
const defaultInput = {
  rows: [row('ana'), row('bruno')],
  companyPersonIds: ['ana', 'bruno'],
  teams: [{ id: 'north', memberIds: ['ana', 'bruno', 'ana'] }],
  bounds,
}

describe('weekly calendar capacity', () => {
  it('uses Madrid Mondays, exclusive boundaries, and real DST week lengths', () => {
    expect(new Date(bounds.start).toISOString()).toBe('2026-11-22T23:00:00.000Z')
    expect(new Date(bounds.end).toISOString()).toBe('2026-11-29T23:00:00.000Z')
    const march = weeklyCapacityBounds('2026-03-23', '2026-03-29')
    const october = weeklyCapacityBounds('2026-10-19', '2026-10-25')
    expect(march && (march.end - march.start) / 3_600_000).toBe(167)
    expect(october && (october.end - october.start) / 3_600_000).toBe(169)
  })

  it('subtracts confirmed absences and distinguishes a pending request and a missing pattern', () => {
    const result = projectWeeklyCapacity({
      ...defaultInput,
      rows: [
        row('ana', { 0: { approved: true }, 1: { pending: true } }),
        row('bruno', { 0: { plannedSlots: null } }),
      ],
      visits: [],
    })
    expect(result.capacity).toBe(4 * 240)
    expect(result.unknownSchedules).toBe(1)
    expect(result.pendingRequests).toBe(1)
    expect(result.people.map((p) => p.capacity)).toEqual([960, null])
  })

  it('keeps zero capacity for a fully absent person but never assumes a blank shift is zero', () => {
    const noShift = { plannedSlots: null }
    const excluded = row(
      'ana',
      Object.fromEntries(
        Array.from({ length: 7 }, (_, weekday) => [weekday, { ...noShift, approved: true }]),
      ),
    )
    const unknown = row(
      'bruno',
      Object.fromEntries(
        Array.from({ length: 7 }, (_, weekday) => [weekday, { plannedSlots: [] }]),
      ),
    )
    expect(
      projectWeeklyCapacity({
        ...defaultInput,
        rows: [excluded, unknown],
        visits: [],
      }).people.map((item) => item.capacity),
    ).toEqual([0, null])
  })

  it('counts each person per visit once despite duplicate rows, a direct assignee plus team, and repeated team members', () => {
    const teamVisit = visit('team', { work_team_id: 'north' })
    const result = projectWeeklyCapacity({ ...defaultInput, visits: [teamVisit, teamVisit] })
    expect(result.people.map((person) => person.planned)).toEqual([60, 60])
    expect(result.planned).toBe(120)
    expect(result.overlap).toBe(0)
  })

  it('scopes to the chosen people, includes completed plans, and reports simultaneous load apart', () => {
    const result = projectWeeklyCapacity({
      ...defaultInput,
      rows: [row('bruno')],
      visits: [
        visit('team', { work_team_id: 'north' }),
        visit('completed', {
          status: 'completed',
          assigned_user_id: 'bruno',
          scheduled_start_at: '2026-11-23T09:00:00Z',
          scheduled_end_at: '2026-11-23T10:00:00Z',
        }),
        visit('out-of-scope'),
        visit('canceled', { status: 'canceled', assigned_user_id: 'bruno' }),
        visit('skipped', { status: 'skipped', assigned_user_id: 'bruno' }),
      ],
    })
    expect(result.people).toEqual([
      { userId: 'bruno', name: 'bruno', capacity: 1200, planned: 120, overlap: 30 },
    ])
    expect(result.unknownVisits).toBe(0)
  })

  it('clips carried-in or out visits, and separates unassigned and unverifiable load', () => {
    const result = projectWeeklyCapacity({
      ...defaultInput,
      visits: [
        visit('carry-in', {
          scheduled_start_at: '2026-11-22T22:00:00Z',
          scheduled_end_at: '2026-11-22T23:20:00Z',
        }),
        visit('before', {
          scheduled_start_at: '2026-11-22T22:00:00Z',
          scheduled_end_at: '2026-11-22T23:00:00Z',
        }),
        visit('after', {
          scheduled_start_at: '2026-11-29T23:00:00Z',
          scheduled_end_at: '2026-11-30T00:00:00Z',
        }),
        visit('carry-out-unassigned', {
          scheduled_start_at: '2026-11-29T22:30:00Z',
          scheduled_end_at: '2026-11-30T00:00:00Z',
          assigned_user_id: null,
        }),
        visit('missing-team', { assigned_user_id: null, work_team_id: 'missing' }),
        visit('inactive-person', { assigned_user_id: 'not-in-company' }),
      ],
    })
    expect(result.planned).toBe(20)
    expect(result.unassignedMinutes).toBe(30)
    expect(result.unassignedVisits).toBe(1)
    expect(result.unknownVisits).toBe(2)
  })
})
