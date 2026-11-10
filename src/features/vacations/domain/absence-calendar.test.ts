import { describe, expect, it } from 'vitest'

import { calendarDate, dateValue, monthWeeks, moveDays, moveMonths, selectAbsenceDay } from './absence-calendar'

describe('calendario de ausencias', () => {
  it('mantiene fechas locales al cruzar meses, años y cambios horarios', () => {
    expect(dateValue(calendarDate('2026-03-29'))).toBe('2026-03-29')
    expect(moveDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(moveDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(moveMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(moveMonths('2024-02-29', 12)).toBe('2025-02-28')
  })

  it('crea semanas de lunes a domingo incluyendo el 29 de febrero', () => {
    const weeks = monthWeeks('2024-02-10')
    expect(weeks[0]).toEqual([null, null, null, '2024-02-01', '2024-02-02', '2024-02-03', '2024-02-04'])
    expect(weeks.at(-1)).toEqual(['2024-02-26', '2024-02-27', '2024-02-28', '2024-02-29', null, null, null])
  })

  it('permite rangos invertidos, de un día y empezar una nueva selección', () => {
    expect(selectAbsenceDay('', '', '2026-11-10')).toEqual({ start: '2026-11-10', end: '' })
    expect(selectAbsenceDay('2026-11-10', '', '2026-11-08')).toEqual({ start: '2026-11-08', end: '2026-11-10' })
    expect(selectAbsenceDay('2026-11-10', '', '2026-11-10')).toEqual({ start: '2026-11-10', end: '2026-11-10' })
    expect(selectAbsenceDay('2026-11-08', '2026-11-10', '2026-12-01')).toEqual({ start: '2026-12-01', end: '' })
  })
})