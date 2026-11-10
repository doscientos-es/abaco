import { describe, expect, it } from 'vitest'

import { calendarDate, dateValue } from './date-range'
import {
  calendarChange,
  calendarDays,
  calendarLocalInput,
  calendarStep,
  eventIntersectsDay,
  timedEventLayout,
  type CalendarEvent,
} from './event-calendar'

const date = (value: string) => new Date(`${value}:00`)
const event = (id: string, start: string, end: string): CalendarEvent => ({
  id,
  title: id,
  start: date(start),
  end: date(end),
})

describe('shared event calendar dates and layout', () => {
  it('builds Monday-first month/week grids and an exact single day', () => {
    const anchor = calendarDate('2026-11-13')
    const month = calendarDays(anchor, 'month')
    expect(month).toHaveLength(42)
    expect(dateValue(month[0] ?? anchor)).toBe('2026-10-26')
    expect(dateValue(month.at(-1) ?? anchor)).toBe('2026-12-06')
    expect(calendarDays(anchor, 'week').map(dateValue)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ])
    expect(calendarDays(anchor, 'day').map(dateValue)).toEqual(['2026-11-13'])
    expect(dateValue(anchor)).toBe('2026-11-13')
  })

  it('steps by day/week/month and clamps month ends, including leap years', () => {
    expect(dateValue(calendarStep(calendarDate('2026-12-31'), 'day', 1))).toBe('2027-01-01')
    expect(dateValue(calendarStep(calendarDate('2026-11-13'), 'week', -1))).toBe('2026-11-06')
    expect(dateValue(calendarStep(calendarDate('2028-01-31'), 'month', 1))).toBe('2028-02-29')
  })

  it('moves a timed event with 15-minute snapping, duration intact and no mutation', () => {
    const item = event('work', '2026-11-13T09:00', '2026-11-13T10:30')
    const result = calendarChange(item, date('2026-11-14T15:07'), 'move')
    expect(calendarLocalInput(result.start)).toBe('2026-11-14T15:00')
    expect(calendarLocalInput(result.end)).toBe('2026-11-14T16:30')
    expect(calendarLocalInput(item.start)).toBe('2026-11-13T09:00')
  })

  it('resizes across midnight and enforces a positive minimum', () => {
    const item = event('night', '2026-11-13T23:00', '2026-11-14T00:00')
    expect(calendarLocalInput(calendarChange(item, date('2026-11-14T02:00'), 'resize').end)).toBe(
      '2026-11-14T02:00',
    )
    expect(calendarLocalInput(calendarChange(item, date('2026-11-13T08:00'), 'resize').end)).toBe(
      '2026-11-13T23:15',
    )
  })

  it('uses exclusive all-day ends and preserves a multi-day duration', () => {
    const item = { ...event('absence', '2026-11-10T00:00', '2026-11-13T00:00'), allDay: true }
    const result = calendarChange(item, date('2026-11-20T12:00'), 'move')
    expect(calendarLocalInput(result.start)).toBe('2026-11-20T00:00')
    expect(calendarLocalInput(result.end)).toBe('2026-11-23T00:00')
    expect(eventIntersectsDay(item, calendarDate('2026-11-12'))).toBe(true)
    expect(eventIntersectsDay(item, calendarDate('2026-11-13'))).toBe(false)
    expect(calendarLocalInput(calendarChange(item, item.start, 'resize').end)).toBe(
      '2026-11-11T00:00',
    )
  })

  it('puts chained overlaps in separate lanes and reuses them at exact boundaries', () => {
    const layout = timedEventLayout(
      [
        event('a', '2026-11-13T09:00', '2026-11-13T10:00'),
        event('b', '2026-11-13T09:30', '2026-11-13T11:00'),
        event('c', '2026-11-13T10:00', '2026-11-13T12:00'),
        event('d', '2026-11-13T12:00', '2026-11-13T13:00'),
      ],
      calendarDate('2026-11-13'),
    )
    expect(layout.map(({ lane, lanes }) => [lane, lanes])).toEqual([
      [0, 2],
      [1, 2],
      [0, 2],
      [0, 1],
    ])
    expect(layout[0]?.top).toBe(37.5)
    expect(layout[0]?.height).toBeCloseTo(100 / 24)
  })

  it('clips overnight segments and does not count an exclusive midnight twice', () => {
    const item = event('overnight', '2026-11-13T23:00', '2026-11-14T01:00')
    expect(timedEventLayout([item], calendarDate('2026-11-13'))[0]?.height).toBeCloseTo(100 / 24)
    expect(timedEventLayout([item], calendarDate('2026-11-14'))[0]?.top).toBe(0)
    expect(timedEventLayout([item], calendarDate('2026-11-15'))).toEqual([])
  })
})
