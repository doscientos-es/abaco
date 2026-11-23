import { describe, expect, it } from 'vitest'

import { workDayChanges, workVisitDay, type WorkDayVisit } from './work-days'

const visit = (
  id: string,
  start: string,
  status: WorkDayVisit['status'] = 'scheduled',
): WorkDayVisit => ({
  id,
  scheduled_start_at: start,
  status,
  updated_at: 'version',
  service_locations: { timezone: 'Europe/Madrid' },
})

describe('work days', () => {
  it('uses the location calendar day rather than the UTC day', () => {
    expect(workVisitDay(visit('1', '2026-10-31T23:30:00Z'))).toBe('2026-11-01')
    expect(
      workVisitDay({
        ...visit('2', '2026-10-31T23:30:00Z'),
        service_locations: [{ timezone: 'Europe/Madrid' }],
      }),
    ).toBe('2026-11-01')
  })

  it('adds only new days and cancels only removed visits, keeping multiple visits on a retained day', () => {
    const visits = [
      visit('1', '2026-11-01T08:00:00Z'),
      visit('2', '2026-11-01T10:00:00Z'),
      visit('3', '2026-11-03T08:00:00Z'),
    ]
    expect(workDayChanges(visits, ['2026-11-01', '2026-11-05', '2026-11-05'])).toEqual({
      add: ['2026-11-05'],
      remove: [visits[2]],
    })
  })

  it('never removes visits that have already started or finished', () => {
    for (const status of ['in_progress', 'completed', 'skipped'] as const) {
      expect(() => workDayChanges([visit('1', '2026-11-01T08:00:00Z', status)], [])).toThrow(
        'No se pueden quitar días',
      )
    }
  })
})
