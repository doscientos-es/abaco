import { dateValue } from '@/shared/lib/date-range'
import {
  atCalendarMinutes,
  calendarDays,
  type EventCalendarView,
} from '@/shared/lib/event-calendar'

export type StaffFunction = { id: string; name: string }
export type StaffSlot = { weekday: number; start: number; end: number }
export type StaffSchedule = {
  userId: string
  updatedAt: string
  slots: StaffSlot[]
  functionIds: string[]
}
export type StaffPerson = { userId: string; name: string; schedule: StaffSchedule | null }
export type StaffAbsence = { userId: string; startDate: string; endDate: string | null }
export type StaffOccurrence = {
  id: string
  userId: string
  name: string
  date: string
  start: Date
  end: Date
}

export const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export function scheduleError(slots: StaffSlot[]): string | null {
  if (slots.length > 56) return 'El horario admite hasta 56 franjas.'
  for (const slot of slots) {
    if (
      !Number.isInteger(slot.weekday) ||
      slot.weekday < 1 ||
      slot.weekday > 7 ||
      !Number.isInteger(slot.start) ||
      !Number.isInteger(slot.end) ||
      slot.start < 0 ||
      slot.end > 1440 ||
      slot.start >= slot.end
    )
      return 'Revisa los días y las horas de cada franja.'
  }
  if (
    slots.some((a, i) =>
      slots.some(
        (b, j) => i !== j && a.weekday === b.weekday && a.start < b.end && b.start < a.end,
      ),
    )
  )
    return 'Las franjas de una misma persona no pueden solaparse.'
  return null
}

export function scheduleOccurrences(
  people: StaffPerson[],
  absences: StaffAbsence[],
  date: Date,
  view: EventCalendarView,
): StaffOccurrence[] {
  return calendarDays(date, view).flatMap((day) => {
    const dateString = dateValue(day)
    const weekday = ((day.getDay() + 6) % 7) + 1
    return people.flatMap((person) => {
      if (
        absences.some(
          (absence) =>
            absence.userId === person.userId &&
            absence.startDate <= dateString &&
            (absence.endDate === null || absence.endDate >= dateString),
        )
      )
        return []
      return (person.schedule?.slots ?? []).flatMap((slot, index) =>
        slot.weekday === weekday
          ? [
              {
                id: `${person.userId}:${dateString}:${index}`,
                userId: person.userId,
                name: person.name,
                date: dateString,
                start: atCalendarMinutes(day, slot.start),
                end: atCalendarMinutes(day, slot.end),
              },
            ]
          : [],
      )
    })
  })
}
