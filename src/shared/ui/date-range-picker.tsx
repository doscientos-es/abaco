import { Button, Popover } from '@doscientos/ui'
import { CalendarBlank } from '@phosphor-icons/react'
import { useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { es } from 'react-day-picker/locale'

import 'react-day-picker/style.css'

import { calendarDate, dateRangePresets, dateValue, selectRangeDay } from '@/shared/lib/date-range'

import './date-range-picker.css'

export type DateRangePickerProps = {
  start: string
  end: string
  onChange: (start: string, end: string) => void
  allowOpenStart?: boolean
  allowOpenEnd?: boolean
  label: string
}

const dateFormat = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function DateRangeCalendar({
  start,
  end,
  onChange,
  allowOpenStart = false,
  allowOpenEnd = false,
  label,
}: DateRangePickerProps) {
  const [month, setMonth] = useState(() => calendarDate(start || end || dateValue(new Date())))
  const selected = start
    ? { from: calendarDate(start), to: end ? calendarDate(end) : undefined }
    : end
      ? { from: calendarDate(end), to: calendarDate(end) }
      : undefined

  return (
    <div className="date-range-picker space-y-3 p-2" aria-label={label} role="group">
      <div className="flex flex-wrap gap-1.5" aria-label="Atajos de fecha">
        {dateRangePresets(dateValue(new Date())).map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="border-border hover:bg-muted focus-visible:ring-ring rounded-full border px-3 py-1.5 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
            onClick={() => {
              onChange(preset.start, preset.end)
              setMonth(calendarDate(preset.start))
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <DayPicker
        mode="range"
        locale={es}
        weekStartsOn={1}
        numberOfMonths={2}
        month={month}
        onMonthChange={setMonth}
        selected={selected}
        onSelect={(_range, day) => {
          const next = selectRangeDay(start, end, dateValue(day))
          onChange(next.start, next.end)
        }}
        aria-label={label}
      />
      <p className="text-muted-foreground text-xs" aria-live="polite">
        {!start && !end
          ? 'Elige el primer día y después el último.'
          : start && !end
            ? allowOpenEnd
              ? 'Elige el último día o deja el fin sin definir.'
              : 'Elige el último día. Para un solo día, selecciónalo de nuevo.'
            : 'El último día está incluido. Elige otro día para empezar de nuevo.'}
      </p>
      <div className="border-border flex flex-wrap gap-x-4 gap-y-2 border-t pt-3">
        {start || end ? (
          <button
            type="button"
            onClick={() => onChange('', '')}
            className="text-primary text-xs font-medium underline underline-offset-2"
          >
            Limpiar fechas
          </button>
        ) : null}
        {allowOpenStart && start ? (
          <button
            type="button"
            onClick={() => onChange('', end || start)}
            className="text-primary text-xs font-medium underline underline-offset-2"
          >
            Filtrar solo hasta
          </button>
        ) : null}
        {allowOpenStart && start && end ? (
          <button
            type="button"
            onClick={() => onChange(start, '')}
            className="text-primary text-xs font-medium underline underline-offset-2"
          >
            Filtrar solo desde
          </button>
        ) : null}
        {allowOpenEnd && !allowOpenStart && end ? (
          <button
            type="button"
            onClick={() => onChange(start, '')}
            className="text-primary text-xs font-medium underline underline-offset-2"
          >
            Dejar fin desconocido
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function DateRangePicker(props: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { start, end, label, allowOpenEnd } = props
  const startText = start ? dateFormat.format(calendarDate(start)) : 'Selecciona un día'
  const endText = end
    ? dateFormat.format(calendarDate(end))
    : allowOpenEnd && start
      ? 'Sin fecha de fin'
      : 'Selecciona un día'

  return (
    <div className="grid min-w-0 gap-2 sm:col-span-2">
      <p className="text-sm font-medium">{label}</p>
      <Popover
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        placement="bottom start"
        className="max-h-[80dvh] w-[min(38rem,calc(100vw-2rem))] overflow-y-auto p-2"
        trigger={
          <Button
            type="button"
            variant="outline"
            aria-label={`${label}. Desde ${startText}. Hasta ${endText}`}
            className="h-auto min-h-12 w-full justify-between gap-3 px-3 py-2 text-left font-normal"
          >
            <span className="min-w-0 truncate">
              {startText} <span aria-hidden="true">—</span> {endText}
            </span>
            <CalendarBlank aria-hidden="true" className="size-4 shrink-0" />
          </Button>
        }
      >
        <DateRangeCalendar {...props} />
        <div className="flex justify-end px-2 pb-2">
          <Button type="button" size="sm" onPress={() => setIsOpen(false)}>
            Listo
          </Button>
        </div>
      </Popover>
    </div>
  )
}
