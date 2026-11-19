import { Button, Popover } from '@doscientos/ui'
import { CaretDownIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import { calendarDate, dateValue } from '@/shared/lib/date-range'
import { calendarDays, calendarStep, type EventCalendarView } from '@/shared/lib/event-calendar'

import { TextField } from './form'

const periods = ['day', 'week', 'month'] as const
const periodLabels = { day: 'Día', week: 'Semana', month: 'Mes' }
const dayLabel = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const monthLabel = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
const weekLabel = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function periodHeading(value: Date, view: EventCalendarView) {
  if (view === 'day') return dayLabel.format(value)
  if (view === 'month') return monthLabel.format(value)
  const days = calendarDays(value, 'week')
  return weekLabel.formatRange(days[0] ?? value, days.at(-1) ?? value)
}

export function CalendarToolbar({
  value,
  view,
  today,
  onDateChange,
  onViewChange,
  actions,
}: {
  value: Date
  view: EventCalendarView
  today?: Date
  onDateChange: (value: Date) => void
  onViewChange?: (view: EventCalendarView) => void
  actions?: ReactNode
}) {
  const heading = periodHeading(value, view)
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Periodo anterior"
          onPress={() => onDateChange(calendarStep(value, view, -1))}
        >
          <CaretLeftIcon aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Periodo siguiente"
          onPress={() => onDateChange(calendarStep(value, view, 1))}
        >
          <CaretRightIcon aria-hidden="true" />
        </Button>
        <Button variant="outline" size="sm" onPress={() => onDateChange(today ?? new Date())}>
          Hoy
        </Button>
      </div>
      <Popover
        placement="bottom start"
        className="p-3"
        trigger={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${heading}. Ir a una fecha`}
            className="max-w-full min-w-0"
          >
            <span className="truncate font-semibold first-letter:uppercase">{heading}</span>
            <CaretDownIcon aria-hidden="true" />
          </Button>
        }
      >
        <TextField
          label="Fecha de referencia"
          placeholder="Fecha"
          type="date"
          value={dateValue(value)}
          onChange={(date) => {
            if (date) onDateChange(calendarDate(date))
          }}
        />
      </Popover>
      {onViewChange || actions ? (
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          {onViewChange ? (
            <fieldset className="bg-muted inline-flex items-center rounded-lg p-0.5">
              <legend className="sr-only">Periodo del calendario</legend>
              {periods.map((period) => (
                <Button
                  key={period}
                  size="sm"
                  variant={view === period ? 'outline' : 'ghost'}
                  aria-pressed={view === period}
                  onPress={() => onViewChange(period)}
                >
                  {periodLabels[period]}
                </Button>
              ))}
            </fieldset>
          ) : null}
          {actions}
        </div>
      ) : null}
    </div>
  )
}
