import { calendarDate, dateValue, moveDays, moveMonths } from './date-range'

export type EventCalendarView = 'day' | 'week' | 'month'
export type CalendarEvent = {
  id: string
  revision?: string | undefined
  title: string
  start: Date
  /** Exclusive end, including for all-day events. */
  end: Date
  allDay?: boolean
  editable?: boolean
  resizable?: boolean
  tone?: 'primary' | 'success' | 'warning' | 'muted' | 'danger'
  description?: string
}
export type CalendarEventChange = {
  item: CalendarEvent
  start: Date
  end: Date
  kind: 'move' | 'resize'
}

export function atCalendarMinutes(day: Date, minutes: number) {
  const value = new Date(day)
  value.setHours(0, minutes, 0, 0)
  return value
}

export function calendarDays(value: Date, view: EventCalendarView) {
  const start = calendarDate(dateValue(value))
  if (view === 'month') start.setDate(1)
  if (view !== 'day') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return Array.from({ length: view === 'month' ? 42 : view === 'week' ? 7 : 1 }, (_, index) =>
    calendarDate(moveDays(dateValue(start), index)),
  )
}

export function calendarStep(value: Date, view: EventCalendarView, direction: number) {
  return calendarDate(
    view === 'month'
      ? moveMonths(dateValue(value), direction)
      : moveDays(dateValue(value), direction * (view === 'week' ? 7 : 1)),
  )
}

export function eventIntersectsDay(item: CalendarEvent, day: Date) {
  return item.start < atCalendarMinutes(day, 1440) && item.end > atCalendarMinutes(day, 0)
}

/** Wall-clock arithmetic does not inherit the browser's daylight-saving transitions. */
export function wallTimeNumber(value: Date) {
  return Date.UTC(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    value.getHours(),
    value.getMinutes(),
  )
}

function fromWallTime(value: number) {
  const utc = new Date(value)
  return new Date(
    utc.getUTCFullYear(),
    utc.getUTCMonth(),
    utc.getUTCDate(),
    utc.getUTCHours(),
    utc.getUTCMinutes(),
  )
}

export function calendarChange(
  item: CalendarEvent,
  target: Date,
  kind: 'move' | 'resize',
  step = 15,
): CalendarEventChange {
  const snapped = new Date(target)
  if (item.allDay) snapped.setHours(0, 0, 0, 0)
  else snapped.setMinutes(Math.round(snapped.getMinutes() / step) * step, 0, 0)
  if (kind === 'resize') {
    const minimum = item.allDay ? 1440 : step
    const end = fromWallTime(
      Math.max(wallTimeNumber(item.start) + minimum * 60000, wallTimeNumber(snapped)),
    )
    return { item, start: item.start, end, kind }
  }
  const duration = wallTimeNumber(item.end) - wallTimeNumber(item.start)
  return { item, start: snapped, end: fromWallTime(wallTimeNumber(snapped) + duration), kind }
}

export function calendarTime(value: Date) {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
}

export function calendarLocalInput(value: Date) {
  return `${dateValue(value)}T${calendarTime(value)}`
}

/** Assign non-overlapping lanes to events, including chained overlaps and overnight segments. */
export function timedEventLayout(items: CalendarEvent[], day: Date) {
  const start = wallTimeNumber(atCalendarMinutes(day, 0))
  const end = wallTimeNumber(atCalendarMinutes(day, 1440))
  const sorted = items
    .filter((item) => !item.allDay && eventIntersectsDay(item, day))
    .map((item) => ({
      item,
      start: Math.max(start, wallTimeNumber(item.start)),
      end: Math.min(end, wallTimeNumber(item.end)),
      lane: 0,
      lanes: 1,
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.item.id.localeCompare(b.item.id))
  let group: typeof sorted = []
  let groupEnd = 0
  let laneEnds: number[] = []
  const finish = () => {
    for (const event of group) event.lanes = laneEnds.length
  }
  for (const event of sorted) {
    if (event.start >= groupEnd) {
      finish()
      group = []
      laneEnds = []
    }
    let lane = laneEnds.findIndex((value) => value <= event.start)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = event.end
    event.lane = lane
    group.push(event)
    groupEnd = Math.max(groupEnd, event.end)
  }
  finish()
  return sorted.map((event) => ({
    ...event,
    top: ((event.start - start) / (end - start)) * 100,
    height: ((event.end - event.start) / (end - start)) * 100,
  }))
}
