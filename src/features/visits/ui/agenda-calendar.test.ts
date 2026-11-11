import { describe, expect, it } from 'vitest'

import {
  calendarMonthRange,
  moveCalendarMonth,
  calendarWeekLabel,
  calendarWeekRange,
  toCalendarWallTime,
} from './agenda-calendar'

describe('agenda calendar helpers', () => {
  it('uses Monday through Sunday for the selected week', () => {
    expect(calendarWeekRange('2026-06-10')).toEqual({ from: '2026-06-08', to: '2026-06-14' })
    expect(calendarWeekRange('2026-06-14')).toEqual({ from: '2026-06-08', to: '2026-06-14' })
  })

  it('labels the full week and preserves the visit timezone wall time', () => {
    expect(calendarWeekLabel('2026-06-10')).toContain('8 jun')
    expect(toCalendarWallTime('2026-06-08T07:00:00.000Z', 'Europe/Madrid').getHours()).toBe(9)
  })

  it('covers complete months, leap days and year boundaries without overflowing', () => {
    expect(calendarMonthRange('2028-02-29')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(calendarMonthRange('2027-02-28')).toEqual({ from: '2027-02-01', to: '2027-02-28' })
    expect(moveCalendarMonth('2026-01-31', 1)).toBe('2026-02-01')
    expect(moveCalendarMonth('2026-12-31', 1)).toBe('2027-01-01')
    expect(moveCalendarMonth('2026-01-01', -1)).toBe('2025-12-01')
  })
})
