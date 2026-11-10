import { Button, toast } from '@doscientos/ui'
import { useState } from 'react'

import { calendarDate } from '@/shared/lib/date-range'
import {
  atCalendarMinutes,
  calendarDays,
  wallTimeNumber,
  type CalendarEvent,
} from '@/shared/lib/event-calendar'
import { EventCalendar } from '@/shared/ui/event-calendar'

import {
  minuteLabel,
  scheduleDays,
  weeklyOccurrenceCount,
  weeklyScheduleError,
  type WeeklyTimeSlot,
} from '../domain/weekly-schedule'

// A stable, DST-free template week; these dates are never persisted as actual work dates.
const monday = new Date(2026, 0, 5)
function slotEvent(slot: WeeklyTimeSlot, week: Date): CalendarEvent {
  const day = new Date(week)
  day.setDate(day.getDate() + slot.weekday - 1)
  return {
    id: slot.id,
    title: 'Horario de trabajo',
    start: atCalendarMinutes(day, slot.start_minute),
    end: atCalendarMinutes(day, slot.start_minute + slot.duration_minutes),
    editable: true,
  }
}

export function WeeklyScheduleEditor({
  value,
  onChange,
  startsOn,
  endsOn,
  alternate = false,
  referenceDate,
  recurrenceLabel,
}: {
  value: WeeklyTimeSlot[]
  onChange: (slots: WeeklyTimeSlot[]) => void
  startsOn: string
  endsOn: string
  alternate?: boolean
  referenceDate?: string | undefined
  recurrenceLabel?: string | undefined
}) {
  const [editing, setEditing] = useState(false)
  const week = referenceDate
    ? (calendarDays(calendarDate(referenceDate), 'week')[0] ?? monday)
    : monday
  function apply(slots: WeeklyTimeSlot[]) {
    const error = slots.length ? weeklyScheduleError(slots) : null
    if (error) toast.error(error)
    else onChange(slots)
  }
  function rangeSlot(id: string, start: Date, end: Date): WeeklyTimeSlot {
    return {
      id,
      weekday: ((start.getDay() + 6) % 7) + 1,
      start_minute: start.getHours() * 60 + start.getMinutes(),
      duration_minutes: (wallTimeNumber(end) - wallTimeNumber(start)) / 60000,
    }
  }
  const minutes = value.reduce((sum, slot) => sum + slot.duration_minutes, 0)
  return (
    <section className="space-y-3 sm:col-span-2" aria-label="Horario semanal del trabajo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            {referenceDate
              ? 'Marca el primer trabajo en su semana de referencia'
              : 'Dibuja el horario semanal'}
          </h3>
          <p className="text-muted-foreground text-sm">
            Arrastra en un día para marcar de qué hora a qué hora.{' '}
            {referenceDate
              ? `Se repetirá ${recurrenceLabel}; el día de la semana puede variar.`
              : 'Puedes añadir varios turnos, moverlos y ampliar su borde inferior.'}
          </p>
        </div>
        {!referenceDate ? (
          <Button
            variant="outline"
            onPress={() => {
              const source = value.filter((slot) => slot.weekday === 1)
              if (!source.length) {
                toast.error('Marca primero el horario del lunes.')
                return
              }
              apply([
                ...value.filter((slot) => slot.weekday > 5),
                ...[1, 2, 3, 4, 5].flatMap((weekday) =>
                  source.map((slot) => ({
                    ...slot,
                    weekday,
                    id: weekday === 1 ? slot.id : crypto.randomUUID(),
                  })),
                ),
              ])
            }}
          >
            Copiar lunes a lunes–viernes
          </Button>
        ) : null}
      </div>
      <EventCalendar
        aria-label="Semana tipo del contrato"
        value={week}
        view="week"
        items={value
          .filter((slot) => Number.isFinite(slot.start_minute) && slot.duration_minutes >= 15)
          .map((slot) => slotEvent(slot, week))}
        showAllDay={false}
        renderDayLabel={referenceDate ? undefined : (day) => scheduleDays[(day.getDay() + 6) % 7]}
        onItemClick={() => setEditing(true)}
        onRangeSelect={({ start, end }) =>
          apply([...(referenceDate ? [] : value), rangeSlot(crypto.randomUUID(), start, end)])
        }
        onItemChange={({ item, start, end }) =>
          apply(value.map((slot) => (slot.id === item.id ? rangeSlot(slot.id, start, end) : slot)))
        }
      />
      <output className="block text-sm" aria-live="polite">
        {value.length} franjas · {minutes / 60} h{' '}
        {referenceDate
          ? `por trabajo · ${recurrenceLabel}`
          : `por ${alternate ? 'quincena' : 'semana'}`}
        {!referenceDate && startsOn && endsOn
          ? ` · ${weeklyOccurrenceCount(value, startsOn, endsOn, alternate)} trabajos previstos entre ${startsOn} y ${endsOn}, ambos incluidos`
          : referenceDate
            ? ` · Hasta ${endsOn || 'el fin obligatorio del contrato'}`
            : ' · Guarda la vigencia del contrato para ver el total'}
      </output>
      <details
        className="rounded-lg border p-3"
        open={editing || value.length === 0}
        onToggle={(event) => setEditing(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium">
          Editar horas sin arrastrar o eliminar franjas
        </summary>
        <div className="mt-3 space-y-2">
          {value.map((slot) => (
            <div key={slot.id} className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Día de la franja"
                className="bg-background rounded border p-2"
                value={slot.weekday}
                onChange={(e) =>
                  onChange(
                    value.map((s) =>
                      s.id === slot.id ? { ...s, weekday: Number(e.target.value) } : s,
                    ),
                  )
                }
              >
                {scheduleDays.map((day, i) => (
                  <option key={day} value={i + 1}>
                    {day}
                  </option>
                ))}
              </select>
              <input
                aria-label="Hora de inicio de la franja"
                className="bg-background rounded border p-2"
                type="time"
                step={900}
                value={minuteLabel(slot.start_minute)}
                onChange={(e) => {
                  if (!e.target.value) return
                  const [h = 0, m = 0] = e.target.value.split(':').map(Number)
                  onChange(
                    value.map((s) => (s.id === slot.id ? { ...s, start_minute: h * 60 + m } : s)),
                  )
                }}
              />
              <span>
                → {minuteLabel(slot.start_minute + slot.duration_minutes)}
                {slot.start_minute + slot.duration_minutes >= 1440 ? ' (+1 día)' : ''}
              </span>
              <input
                aria-label="Duración de la franja en minutos"
                className="bg-background w-24 rounded border p-2"
                type="number"
                min={15}
                max={720}
                step={15}
                value={slot.duration_minutes}
                onChange={(e) =>
                  onChange(
                    value.map((s) =>
                      s.id === slot.id ? { ...s, duration_minutes: Number(e.target.value) } : s,
                    ),
                  )
                }
              />
              <Button
                variant="outline"
                onPress={() => apply(value.filter((s) => s.id !== slot.id))}
              >
                Eliminar franja
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            onPress={() =>
              apply([
                ...(referenceDate ? [] : value),
                {
                  id: crypto.randomUUID(),
                  weekday: referenceDate ? ((calendarDate(referenceDate).getDay() + 6) % 7) + 1 : 1,
                  start_minute: 540,
                  duration_minutes: 60,
                },
              ])
            }
          >
            {referenceDate ? 'Marcar franja de referencia' : 'Añadir franja manualmente'}
          </Button>
        </div>
      </details>
      {value.length && weeklyScheduleError(value) ? (
        <p role="alert" className="text-destructive text-sm">
          {weeklyScheduleError(value)}
        </p>
      ) : null}
    </section>
  )
}
