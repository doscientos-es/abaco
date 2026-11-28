import { describe, expect, it } from 'vitest'

import type { StaffSchedule } from '@/features/staff-schedules/domain/staff-schedule'

import type { VisitSummary } from '../application/visit-actions'
import { substitutionPeriod, visitSubstitutions } from './visit-substitution'

const visit: VisitSummary = {
  id: 'visit',
  title: 'Visita de prueba',
  client_name: '',
  location_name: '',
  address: '',
  timezone: 'Europe/Madrid',
  assigned_user_id: 'absent',
  work_team_id: null,
  scheduled_start_at: '2026-11-16T08:00:00Z',
  scheduled_end_at: '2026-11-16T09:00:00Z',
  status: 'scheduled',
  priority: 'normal',
  notes: '',
  updated_at: 'version',
}
const target = {
  id: visit.id,
  assigned_user_id: 'absent',
  work_team_id: null,
  updated_at: visit.updated_at,
  work_order_id: null,
  work_orders: null,
}
const schedule = (userId: string, slots?: StaffSchedule['slots']): StaffSchedule => ({
  userId,
  updatedAt: 'schedule',
  functionIds: ['electrician'],
  slots: slots ?? [
    { weekday: 1, start: 540, end: 570 },
    { weekday: 1, start: 570, end: 600 },
  ],
})
const person = (id: string) => ({ id, label: id })
const defaultInput: Parameters<typeof visitSubstitutions>[0] = {
  visit,
  technicians: ['absent', 'working', 'unknown'].map(person),
  schedules: ['absent', 'working'].map((id) => schedule(id)),
  absences: [{ userId: 'absent', startDate: '2026-11-16', endDate: '2026-11-16' }],
  slots: [target],
  teams: [],
  functionId: 'electrician',
}

describe('substitution candidates', () => {
  it('requires the whole slot, treats adjacent shifts as continuous, and labels missing schedules', () => {
    expect(visitSubstitutions(defaultInput)).toEqual({
      verified: true,
      candidates: [person('working')],
      unknown: 1,
    })
    expect(
      visitSubstitutions({
        ...defaultInput,
        schedules: [
          schedule('working', [
            { weekday: 1, start: 540, end: 569 },
            { weekday: 1, start: 570, end: 600 },
          ]),
          schedule('unknown', []),
        ],
      }),
    ).toEqual({ verified: true, candidates: [], unknown: 1 })
  })

  it('excludes assigned visits, team members attending another visit, approved absences, and incompatible functions', () => {
    const extra = ['directly-booked', 'team-booked', 'on-leave', 'other-function', 'clear']
    expect(
      visitSubstitutions({
        ...defaultInput,
        technicians: extra.map(person),
        schedules: extra.map((id) => ({
          ...schedule(id),
          ...(id === 'other-function' ? { functionIds: ['different'] } : {}),
        })),
        absences: [
          ...defaultInput.absences,
          { userId: 'on-leave', startDate: '2026-11-01', endDate: null },
        ],
        teams: [
          {
            id: 'team',
            name: '',
            archived: false,
            description: '',
            updatedAt: '',
            memberIds: ['team-booked'],
          },
        ],
        slots: [
          target,
          { ...target, id: 'direct-booking', assigned_user_id: 'directly-booked' },
          { ...target, id: 'team-booking', assigned_user_id: null, work_team_id: 'team' },
        ],
      }),
    ).toEqual({ verified: true, candidates: [person('clear')], unknown: 0 })
  })

  it('respects the underlying work order team, even for a directly assigned visit', () => {
    const team = {
      id: 'required',
      name: '',
      archived: false,
      description: '',
      updatedAt: '',
      memberIds: ['working'],
    }
    const input = {
      ...defaultInput,
      teams: [team],
      slots: [{ ...target, work_order_id: 'work', work_orders: { work_team_id: team.id } }],
    }
    expect(visitSubstitutions(input)).toEqual({
      verified: true,
      candidates: [person('working')],
      unknown: 0,
    })
    expect(visitSubstitutions({ ...input, teams: [{ ...team, archived: true }] })).toEqual({
      verified: false,
    })
  })

  it('refuses an unverified work order, unknown team, changed visit or unconfirmed absence', () => {
    expect(visitSubstitutions({ ...defaultInput, absences: [] })).toEqual({ verified: false })
    expect(
      visitSubstitutions({ ...defaultInput, slots: [{ ...target, updated_at: 'newer' }] }),
    ).toEqual({
      verified: false,
    })
    expect(
      visitSubstitutions({ ...defaultInput, slots: [{ ...target, work_order_id: 'hidden' }] }),
    ).toEqual({
      verified: false,
    })
    expect(
      visitSubstitutions({
        ...defaultInput,
        slots: [target, { ...target, id: 'booking', work_team_id: 'hidden' }],
      }),
    ).toEqual({ verified: false })
  })

  it('supports midnight carry-over with full shifts and uses an exclusive end', () => {
    expect(
      substitutionPeriod({
        ...visit,
        scheduled_start_at: '2026-11-16T22:30:00Z',
        scheduled_end_at: '2026-11-16T23:00:00Z',
      }),
    ).toEqual({
      from: '2026-11-16',
      to: '2026-11-16',
      segments: [{ weekday: 1, start: 1410, end: 1440 }],
    })

    const overnight = {
      ...visit,
      scheduled_start_at: '2026-11-16T22:30:00Z',
      scheduled_end_at: '2026-11-17T00:00:00Z',
    }
    const models = [
      schedule('working', [
        { weekday: 1, start: 1410, end: 1440 },
        { weekday: 2, start: 0, end: 60 },
      ]),
    ]
    expect(
      visitSubstitutions({ ...defaultInput, visit: overnight, schedules: models }),
    ).toMatchObject({
      candidates: [person('working')],
    })
    expect(
      visitSubstitutions({
        ...defaultInput,
        visit: overnight,
        schedules: models,
        absences: [
          ...defaultInput.absences,
          { userId: 'working', startDate: '2026-11-17', endDate: '2026-11-17' },
        ],
      }),
    ).toMatchObject({ candidates: [] })
  })

  it('cannot claim suitable for a foreign zone, DST transition, or non-roundtripping timestamp', () => {
    expect(substitutionPeriod({ ...visit, timezone: 'Atlantic/Canary' })).toBeNull()
    expect(
      substitutionPeriod({
        ...visit,
        scheduled_start_at: '2026-10-25T01:00:00Z',
        scheduled_end_at: '2026-10-25T02:00:00Z',
      }),
    ).toBeNull()
    expect(substitutionPeriod({ ...visit, scheduled_start_at: '2026-11-16T08:00:30Z' })).toBeNull()
  })
})
