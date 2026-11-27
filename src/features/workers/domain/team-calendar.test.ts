import { describe, expect, it } from 'vitest'

import { calendarDate } from '@/shared/lib/date-range'

import { plannedTime, teamCalendarCell, teamCalendarDays } from './team-calendar'

describe('weekly team calendar', () => {
  it('shows a Monday–Sunday week across month/year changes', () => {
    const days = teamCalendarDays(calendarDate('2027-01-01'))
    expect(days.map(({ value, weekday }) => [value, weekday])).toEqual([
      ['2026-12-28', 1],
      ['2026-12-29', 2],
      ['2026-12-30', 3],
      ['2026-12-31', 4],
      ['2027-01-01', 5],
      ['2027-01-02', 6],
      ['2027-01-03', 7],
    ])
  })

  it('retains the planned hours when a confirmed absence overlaps and distinguishes pending', () => {
    const slots = [
      { weekday: 1, start: 840, end: 960 },
      { weekday: 2, start: 540, end: 720 },
      { weekday: 1, start: 540, end: 720 },
    ]
    const result = teamCalendarCell(
      slots,
      [
        { userId: 'ana', startDate: '2026-11-20', endDate: '2026-11-23', status: 'approved' },
        { userId: 'ana', startDate: '2026-11-23', endDate: null, status: 'needs_info' },
      ],
      '2026-11-23',
      1,
    )
    expect(result).toEqual({
      approved: true,
      pending: true,
      plannedSlots: [slots[2], slots[0]],
    })
  })

  it('distinguishes an unconfigured pattern from a day with no turn', () => {
    expect(teamCalendarCell(undefined, [], '2026-11-22', 7).plannedSlots).toBeNull()
    expect(teamCalendarCell([], [], '2026-11-22', 7).plannedSlots).toEqual([])
  })

  it('keeps clock labels as wall time, including midnight at the end of a shift', () => {
    expect(plannedTime(495)).toBe('08:15')
    expect(plannedTime(1440)).toBe('24:00')
  })
})
