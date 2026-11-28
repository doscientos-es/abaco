import { describe, expect, it } from 'vitest'

import {
  dailyTravelRoutes,
  manualTravelMinutes,
  selectedTravelLegs,
  travelLegMargin,
} from './agenda-travel-review'

type Visit = Parameters<typeof dailyTravelRoutes>[0][number]
const makeVisit = (id: string, overrides: Partial<Visit> = {}): Visit => ({
  id,
  title: `Visita ${id}`,
  status: 'scheduled',
  timezone: 'Europe/Madrid',
  scheduled_start_at: '2026-11-28T08:00:00Z',
  scheduled_end_at: '2026-11-28T09:00:00Z',
  route_order: 0,
  assigned_user_id: 'ana',
  assigned_user_name: 'Ana',
  work_team_id: 'norte',
  work_team_name: 'Equipo Norte',
  ...overrides,
})

describe('daily travel review', () => {
  it('does not invent a leg across technicians or combine their visits with team-only assignments', () => {
    const visits = [
      makeVisit('ana-late', { scheduled_start_at: '2026-11-28T08:30:00Z' }),
      makeVisit('team-b', { assigned_user_id: null, assigned_user_name: '' }),
      makeVisit('other-technician', { assigned_user_id: 'pau', assigned_user_name: 'Pau' }),
      makeVisit('ana-early'),
      makeVisit('team-a', { assigned_user_id: null, assigned_user_name: '' }),
      makeVisit('unassigned-a', { assigned_user_id: null, work_team_id: null }),
      makeVisit('unassigned-b', { assigned_user_id: null, work_team_id: null }),
    ]
    expect(
      dailyTravelRoutes(visits, '2026-11-28').map(({ id, name, stops }) => ({
        id,
        name,
        visits: stops.map((stop) => stop.id),
      })),
    ).toEqual([
      { id: 'person:ana', name: 'Ana', visits: ['ana-early', 'ana-late'] },
      { id: 'team:norte', name: 'Equipo Norte', visits: ['team-a', 'team-b'] },
    ])
  })

  it('uses the start day at the visit location and removes invalid and non-scheduled rows', () => {
    const midnight = {
      scheduled_start_at: '2026-11-27T23:30:00Z',
      scheduled_end_at: '2026-11-28T00:30:00Z',
    }
    expect(
      dailyTravelRoutes(
        [
          makeVisit('later'),
          makeVisit('madrid', midnight),
          makeVisit('canaries', { ...midnight, timezone: 'Atlantic/Canary' }),
          makeVisit('invalid-zone', { timezone: 'Bad/zone' }),
          makeVisit('invalid-end', { scheduled_end_at: 'not-a-date' }),
          makeVisit('invalid-start', { scheduled_start_at: 'not-a-date' }),
          makeVisit('zero-duration', { scheduled_end_at: '2026-11-28T08:00:00Z' }),
          makeVisit('canceled', { status: 'canceled' }),
          makeVisit('in-progress', { status: 'in_progress' }),
          makeVisit('complete', { status: 'completed' }),
        ],
        '2026-11-28',
      )[0]?.stops.map(({ id }) => id),
    ).toEqual(['madrid', 'later'])
  })

  it('follows route order then time independently of checkbox order; excludes unauthorized fields', () => {
    const [route] = dailyTravelRoutes(
      [
        makeVisit('late-order', { route_order: 2 }),
        makeVisit('after-start', {
          route_order: 1,
          scheduled_start_at: '2026-11-28T10:30:00Z',
          scheduled_end_at: '2026-11-28T11:00:00Z',
        }),
        makeVisit('first-start', { route_order: 1 }),
      ],
      '2026-11-28',
    )
    expect(route?.stops.map(({ id }) => id)).toEqual(['first-start', 'after-start', 'late-order'])
    const legs = selectedTravelLegs(
      route?.stops ?? [],
      new Set(['late-order', 'first-start', 'nonexistent']),
    )
    expect(legs).toMatchObject([
      { from: { id: 'first-start' }, to: { id: 'late-order' }, omitted: 1, gapMinutes: -60 },
    ])
    expect(Object.keys(legs[0]?.to ?? {}).sort()).toEqual([
      'endsAt',
      'id',
      'routeOrder',
      'startsAt',
      'timezone',
      'title',
    ])
    expect(selectedTravelLegs(route?.stops ?? [], new Set(['first-start']))).toEqual([])
  })

  it('compares absolute times including timezone offsets and fractional minute gaps', () => {
    const [route] = dailyTravelRoutes(
      [
        makeVisit('one', { scheduled_end_at: '2026-11-28T10:00:00+01:00' }),
        makeVisit('two', {
          timezone: 'Atlantic/Canary',
          scheduled_start_at: '2026-11-28T09:20:30+00:00',
          scheduled_end_at: '2026-11-28T10:00:00+00:00',
        }),
      ],
      '2026-11-28',
    )
    const [leg] = selectedTravelLegs(route?.stops ?? [], new Set(['one', 'two']))
    expect(leg?.gapMinutes).toBe(20.5)
    expect(leg?.omitted).toBe(0)
    expect(travelLegMargin(20.5, 20)).toEqual({ status: 'tight', minutes: 0.5 })
  })

  it.each(['', undefined, ' ', '1.5', '1e2', '+2', '-1', '721', '1000'])(
    'does not use invalid manual entry %j',
    (entry) => expect(manualTravelMinutes(entry)).toBeNull(),
  )

  it.each([
    ['0', 0],
    ['35', 35],
    ['720', 720],
  ])('accepts a manual whole-minute value of %s', (input, minutes) => {
    expect(manualTravelMinutes(input)).toBe(minutes)
  })

  it('distinguishes an overlap, absent estimate, missing time, no margin and available time', () => {
    expect(travelLegMargin(-15, null)).toEqual({ status: 'overlap', minutes: 15 })
    expect(travelLegMargin(30, null)).toEqual({ status: 'unknown', minutes: 30 })
    expect(travelLegMargin(30, 45)).toEqual({ status: 'short', minutes: 15 })
    expect(travelLegMargin(30, 30)).toEqual({ status: 'tight', minutes: 0 })
    expect(travelLegMargin(30, 23)).toEqual({ status: 'spare', minutes: 7 })
    expect(travelLegMargin(30, 0)).toEqual({ status: 'spare', minutes: 30 })
  })
})
