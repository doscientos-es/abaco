import { Button, IconButton } from '@doscientos/ui'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'

import { dateValue } from '@/shared/lib/date-range'
import { calendarStep, type EventCalendarView } from '@/shared/lib/event-calendar'

export function CalendarToolbar({
  value,
  view,
  onDateChange,
  onViewChange,
}: {
  value: Date
  view: EventCalendarView
  onDateChange: (value: Date) => void
  onViewChange: (view: EventCalendarView) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          variant="outline"
          label="Periodo anterior"
          onPress={() => onDateChange(calendarStep(value, view, -1))}
        >
          <CaretLeft aria-hidden="true" />
        </IconButton>
        <Button variant="outline" onPress={() => onDateChange(new Date())}>
          Hoy
        </Button>
        <IconButton
          variant="outline"
          label="Periodo siguiente"
          onPress={() => onDateChange(calendarStep(value, view, 1))}
        >
          <CaretRight aria-hidden="true" />
        </IconButton>
        <label className="text-sm">
          <span className="sr-only">Fecha del calendario</span>
          <input
            className="bg-background rounded-md border px-2 py-1.5"
            type="date"
            value={dateValue(value)}
            onChange={(event) => {
              const date = event.target.valueAsDate
              if (date)
                onDateChange(
                  new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12),
                )
            }}
          />
        </label>
      </div>
      <fieldset className="flex rounded-lg border p-1">
        <legend className="sr-only">Periodo del calendario</legend>
        {(['day', 'week', 'month'] as const).map((period) => (
          <Button
            key={period}
            size="sm"
            variant={view === period ? 'default' : 'ghost'}
            aria-pressed={view === period}
            onPress={() => onViewChange(period)}
          >
            {{ day: 'Día', week: 'Semana', month: 'Mes' }[period]}
          </Button>
        ))}
      </fieldset>
    </div>
  )
}
