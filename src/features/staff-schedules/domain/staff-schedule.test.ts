import { describe, expect, it } from 'vitest'

import { calendarDate, dateValue } from '@/shared/lib/date-range'

import { scheduleError, scheduleOccurrences, type StaffPerson } from './staff-schedule'

const person: StaffPerson = {
  userId: 'worker',
  name: 'Ana',
  schedule: {
    userId: 'worker',
    updatedAt: 'v1',
    functionIds: [],
    slots: [
      { weekday: 1, start: 540, end: 720 },
      { weekday: 1, start: 780, end: 1020 },
    ],
  },
}

describe('weekly staff schedules', () => {
  it('allows split and adjacent shifts but rejects overlap and invalid times', () => {
    expect(scheduleError(person.schedule?.slots ?? [])).toBeNull()
    expect(
      scheduleError([
        { weekday: 1, start: 0, end: 60 },
        { weekday: 1, start: 60, end: 90 },
      ]),
    ).toBeNull()
    expect(
      scheduleError([
        { weekday: 1, start: 0, end: 61 },
        { weekday: 1, start: 60, end: 90 },
      ]),
    ).toContain('solaparse')
    expect(scheduleError([{ weekday: 7, start: 1380, end: 1500 }])).not.toBeNull()
  })

  it('expands recurring shifts across the month and excludes approved absences', () => {
    const occurrences = scheduleOccurrences(
      [person],
      [{ userId: 'worker', startDate: '2026-11-09', endDate: '2026-11-09' }],
      calendarDate('2026-11-12'),
      'month',
    )
    expect(occurrences.filter((item) => item.date === '2026-11-09')).toHaveLength(0)
    expect(occurrences.filter((item) => item.date === '2026-11-16')).toHaveLength(2)
    const occurrence = occurrences.find((item) => item.date === '2026-11-16')
    expect(occurrence && dateValue(occurrence.start)).toBe('2026-11-16')
  })

  it('keeps other workers visible and handles open-ended absences', () => {
    const other = { ...person, userId: 'other', name: 'Luis' }
    const occurrences = scheduleOccurrences(
      [person, other],
      [{ userId: 'worker', startDate: '2026-11-01', endDate: null }],
      calendarDate('2026-11-16'),
      'day',
    )
    expect(occurrences).toHaveLength(2)
    expect(occurrences.every((item) => item.userId === 'other')).toBe(true)
  })
})
