import { describe, expect, it } from 'vitest'

import { formatOpeningSchedule, openingScheduleError } from './location-opening-schedule'

describe('centre weekly opening schedule', () => {
  it('accepts unknown, closed, split and overnight hours', () => {
    expect(openingScheduleError(null)).toBeNull()
    expect(openingScheduleError([])).toBeNull()
    const slots = [
      { weekday: 1, start: '09:00', end: '14:00' },
      { weekday: 1, start: '16:00', end: '20:00' },
      { weekday: 2, start: '22:00', end: '02:00' },
      { weekday: 4, start: '00:00', end: '00:00' },
    ]
    expect(openingScheduleError(slots)).toBeNull()
    expect(formatOpeningSchedule(slots)).toContain('Lunes: 09:00–14:00, 16:00–20:00')
    expect(formatOpeningSchedule(slots)).toContain('Martes: 22:00–02:00 (+1 día)')
    expect(formatOpeningSchedule(slots)).toContain('Jueves: 24 horas')
    expect(formatOpeningSchedule(slots)).toContain('Domingo: Cerrado')
  })

  it('rejects invalid, incomplete and overlapping times including the week boundary', () => {
    expect(openingScheduleError([{ weekday: 1, start: '', end: '12:00' }])).toBeTruthy()
    expect(openingScheduleError([{ weekday: 1, start: '09:00', end: '09:00' }])).toBeTruthy()
    expect(openingScheduleError([{ weekday: 8, start: '09:00', end: '12:00' }])).toBeTruthy()
    expect(
      openingScheduleError([
        { weekday: 7, start: '22:00', end: '02:00' },
        { weekday: 1, start: '01:00', end: '03:00' },
      ]),
    ).toContain('solapan')
    expect(
      openingScheduleError([
        { weekday: 7, start: '22:00', end: '02:00' },
        { weekday: 1, start: '02:00', end: '03:00' },
      ]),
    ).toBeNull()
  })
})
