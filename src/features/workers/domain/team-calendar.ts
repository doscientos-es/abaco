import { dateValue } from '@/shared/lib/date-range'
import { calendarDays } from '@/shared/lib/event-calendar'

export type TeamCalendarAbsence = {
  userId: string
  startDate: string
  endDate: string | null
  status: 'approved' | 'pending' | 'needs_info'
}

export type TeamCalendarSlots = { weekday: number; start: number; end: number }
export type TeamCalendarCell = {
  plannedSlots: TeamCalendarSlots[] | null
  approved: boolean
  pending: boolean
}

export function teamCalendarDays(selectedDate: Date) {
  return calendarDays(selectedDate, 'week').map((day, index) => ({
    day,
    value: dateValue(day),
    weekday: index + 1,
  }))
}

export function teamCalendarCell(
  slots: TeamCalendarSlots[] | undefined,
  absences: TeamCalendarAbsence[],
  day: string,
  weekday: number,
): TeamCalendarCell {
  let approved = false
  let pending = false
  for (const absence of absences) {
    if (absence.startDate > day || (absence.endDate !== null && absence.endDate < day)) continue
    if (absence.status === 'approved') approved = true
    else pending = true
  }
  return {
    plannedSlots: slots
      ? slots.filter((slot) => slot.weekday === weekday).sort((a, b) => a.start - b.start)
      : null,
    approved,
    pending,
  }
}

export function plannedTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
