import { describe, expect, it } from 'vitest'

import { agendaResolution } from './agenda-resolution'

const fixture = {
  id: 'visit',
  status: 'scheduled',
  timezone: 'Europe/Madrid',
  scheduled_start_at: '2026-11-28T08:00:00Z',
  scheduled_end_at: '2026-11-28T09:00:00Z',
  assigned_user_id: null as string | null | undefined,
  work_team_id: null as string | null | undefined,
}
const row = (id: string, overrides: Partial<typeof fixture> = {}) => ({
  ...fixture,
  id,
  ...overrides,
})
const day = '2026-11-28'

describe('agenda resolution candidates', () => {
  it('requires explicit null assignments and does not infer team coverage', () => {
    const r = agendaResolution(
      [
        row('b', { assigned_user_id: null, work_team_id: 'team' }),
        row('a'),
        row('c', { work_team_id: undefined }),
        row('d', { assigned_user_id: undefined }),
        row('f', { assigned_user_id: 'user' }),
        row('e', { status: 'in_progress' }),
        row('g', { status: 'canceled' }),
      ],
      [],
      day,
    )
    expect(r.entries.map(({ visit, kind }) => [visit.id, kind])).toEqual([
      ['a', 'unassigned'],
      ['c', 'assignment-unknown'],
      ['d', 'assignment-unknown'],
    ])
    expect(r.uncheckedAbsences).toBe(0)
  })

  it('shows only a matching direct approved range, even when the visit also has a team', () => {
    const late = {
      scheduled_start_at: '2026-11-28T22:30:00Z',
      scheduled_end_at: '2026-11-28T23:30:00Z',
    }
    const r = agendaResolution(
      [
        row('excluded-exclusive-end', {
          ...late,
          assigned_user_id: 'user',
          scheduled_end_at: '2026-11-28T23:00:00Z',
        }),
        row('covered-by-team-only', { ...late, work_team_id: 'team' }),
        row('overlap', { ...late, assigned_user_id: 'user', work_team_id: 'team' }),
        row('other-person', { ...late, assigned_user_id: 'other' }),
        row('earlier-unassigned'),
      ],
      [{ userId: 'user', startDate: '2026-11-29', endDate: null }],
      day,
    )
    expect(r.entries.map(({ visit, kind }) => [visit.id, kind])).toEqual([
      ['earlier-unassigned', 'unassigned'],
      ['overlap', 'approved-absence'],
    ])
  })

  it('uses the scheduled start day in the destination timezone', () => {
    const atUtcEvening = {
      scheduled_start_at: '2026-11-27T23:30:00Z',
      scheduled_end_at: '2026-11-28T00:30:00Z',
    }
    expect(
      agendaResolution(
        [
          row('madrid', atUtcEvening),
          row('canary', { ...atUtcEvening, timezone: 'Atlantic/Canary' }),
        ],
        [],
        day,
      ).entries.map(({ visit }) => visit.id),
    ).toEqual(['madrid'])
  })

  it('does not report checked absences when approved ranges are unavailable', () => {
    const r = agendaResolution([row('a'), row('b', { assigned_user_id: 'person' })], undefined, day)
    expect(r.entries.map(({ kind }) => kind)).toEqual(['unassigned'])
    expect(r.uncheckedAbsences).toBe(1)
  })
})
