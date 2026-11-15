import { atCalendarMinutes, wallTimeNumber, type CalendarEvent } from '@/shared/lib/event-calendar'
import { EventCalendar } from '@/shared/ui/event-calendar'

export type WeeklyCalendarSlot = {
  id: string
  weekday: number
  start_minute: number
  duration_minutes: number
}

const monday = new Date(2026, 0, 5)
const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function rangeSlot(id: string, start: Date, end: Date): WeeklyCalendarSlot {
  return {
    id,
    weekday: ((start.getDay() + 6) % 7) + 1,
    start_minute: start.getHours() * 60 + start.getMinutes(),
    duration_minutes: (wallTimeNumber(end) - wallTimeNumber(start)) / 60000,
  }
}

export function WeeklyScheduleCalendar({
  slots,
  label,
  eventTitle,
  week = monday,
  dated = false,
  onOpen,
  onAdd,
  onUpdate,
}: {
  slots: WeeklyCalendarSlot[]
  label: string
  eventTitle: string
  week?: Date | undefined
  dated?: boolean
  onOpen: () => void
  onAdd: (slot: WeeklyCalendarSlot) => void
  onUpdate: (slot: WeeklyCalendarSlot) => void
}) {
  const items: CalendarEvent[] = slots
    .filter((slot) => Number.isFinite(slot.start_minute) && slot.duration_minutes > 0)
    .map((slot) => {
      const day = new Date(week)
      day.setDate(day.getDate() + slot.weekday - 1)
      return {
        id: slot.id,
        title: eventTitle,
        start: atCalendarMinutes(day, slot.start_minute),
        end: atCalendarMinutes(day, slot.start_minute + slot.duration_minutes),
        editable: true,
      }
    })
  return (
    <EventCalendar
      aria-label={label}
      value={week}
      view="week"
      items={items}
      showAllDay={false}
      showToday={dated}
      renderDayLabel={dated ? undefined : (day) => days[(day.getDay() + 6) % 7]}
      onItemClick={onOpen}
      onRangeSelect={({ start, end }) => onAdd(rangeSlot(crypto.randomUUID(), start, end))}
      onItemChange={({ item, start, end }) => onUpdate(rangeSlot(item.id, start, end))}
    />
  )
}
