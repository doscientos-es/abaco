import { describe, expect, it } from 'vitest'

import { calendarWeekLabel, calendarWeekRange, toCalendarWallTime } from './agenda-calendar'

describe('agenda calendar helpers', () => {
  it('uses Monday through Sunday for the selected week', () => {
    expect(calendarWeekRange('2026-06-10')).toEqual({ from: '2026-06-08', to: '2026-06-14' })
    expect(calendarWeekRange('2026-06-14')).toEqual({ from: '2026-06-08', to: '2026-06-14' })
  })

  it('labels the full week and preserves the visit timezone wall time', () => {
    expect(calendarWeekLabel('2026-06-10')).toContain('8 jun')
    expect(toCalendarWallTime('2026-06-08T07:00:00.000Z', 'Europe/Madrid').getHours()).toBe(9)
  })
})
