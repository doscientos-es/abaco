import { describe, expect, it } from 'vitest'

import {
  contractDatesError,
  weeklyOccurrenceCount,
  weeklyScheduleError,
  type WeeklyTimeSlot,
} from './weekly-schedule'

const slot: WeeklyTimeSlot = { id: 'morning', weekday: 1, start_minute: 540, duration_minutes: 120 }

describe('weekly contract schedules', () => {
  it('accepts split shifts and different hours on different days', () => {
    expect(
      weeklyScheduleError([
        slot,
        { ...slot, id: 'afternoon', start_minute: 900 },
        { ...slot, id: 'tuesday', weekday: 2, duration_minutes: 180 },
      ]),
    ).toBeNull()
  })
  it.each(
    [
      [],
      [{ ...slot, weekday: 0 }],
      [{ ...slot, start_minute: 1440 }],
      [{ ...slot, duration_minutes: 735 }],
      [{ ...slot, start_minute: 541 }],
      [{ ...slot, duration_minutes: 16 }],
      [{ ...slot, id: '' }],
      [slot, { ...slot, start_minute: 900 }],
      [slot, { ...slot, id: 'overlap', start_minute: 600 }],
    ].map((slots) => ({ slots })),
  )('rejects invalid or overlapping slots: $slots', ({ slots }) =>
    expect(weeklyScheduleError(slots)).toBeTruthy(),
  )

  it('detects overnight overlaps including the Sunday to Monday boundary, but allows adjacent shifts', () => {
    const night = { ...slot, weekday: 7, start_minute: 1380, duration_minutes: 180 }
    expect(weeklyScheduleError([night, { ...slot, id: 'early', start_minute: 60 }])).toContain(
      'solaparse',
    )
    expect(weeklyScheduleError([night, { ...slot, id: 'adjacent', start_minute: 120 }])).toBeNull()
  })
  it('counts partial weeks inclusively without creating dates outside the term', () => {
    const slots = [
      slot,
      { ...slot, id: 'friday', weekday: 5 },
      { ...slot, id: 'split', weekday: 5, start_minute: 900 },
    ]
    expect(weeklyOccurrenceCount(slots, '2026-11-13', '2026-11-16')).toBe(3)
    expect(weeklyOccurrenceCount(slots, '2026-11-13', '2026-11-13')).toBe(2)
  })
  it('excludes overnight work extending past the last contract day, but includes midnight endings', () => {
    const night = { ...slot, weekday: 5, start_minute: 1380, duration_minutes: 120 }
    expect(weeklyOccurrenceCount([night], '2026-11-13', '2026-11-13')).toBe(0)
    expect(
      weeklyOccurrenceCount([{ ...night, duration_minutes: 60 }], '2026-11-13', '2026-11-13'),
    ).toBe(1)
    expect(weeklyOccurrenceCount([night], '2026-11-13', '2026-11-14')).toBe(1)
  })
  it('anchors alternate weeks to the Monday of the first partial week', () => {
    expect(weeklyOccurrenceCount([slot], '2026-11-11', '2026-12-01', true)).toBe(1)
    expect(weeklyOccurrenceCount([slot], '2026-11-11', '2026-12-01')).toBe(3)
  })
  it.each([
    ['2026-11-13', ''],
    ['2026-02-30', '2026-03-01'],
    ['2026-11-13', '2026-11-12'],
    ['2026-11-13', '2040-11-13'],
  ])('requires real, bounded start and end dates: %s – %s', (start, end) => {
    expect(contractDatesError(start, end)).toBeTruthy()
    expect(weeklyOccurrenceCount([slot], start, end)).toBe(0)
  })
  it('does not limit full-term previews to the old 180-day generation horizon', () => {
    expect(weeklyOccurrenceCount([slot], '2028-01-01', '2028-12-31')).toBe(52)
    expect(contractDatesError('2028-02-29', '2028-02-29')).toBeNull()
  })
})
