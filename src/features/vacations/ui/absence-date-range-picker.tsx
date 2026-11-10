/* oxlint-disable jsx-a11y/no-noninteractive-element-to-interactive-role -- An interactive calendar uses a semantic table as its grid. */
import { CalendarBlank, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import {
  calendarDate,
  dateValue,
  monthWeeks,
  moveDays,
  moveMonths,
  selectAbsenceDay,
} from '../domain/absence-calendar'

const weekdays = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const monthFormat = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
const dateFormat = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const fullDateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' })

export function AbsenceDateRangePicker({
  start,
  end,
  endOptional,
  onChange,
}: {
  start: string
  end: string
  endOptional: boolean
  onChange: (start: string, end: string) => void
}) {
  const [focused, setFocused] = useState(() => start || dateValue(new Date()))
  const [visible, setVisible] = useState(() => start || dateValue(new Date()))
  const dates = useRef<Record<string, HTMLButtonElement | null>>({})
  const shouldFocus = useRef(false)
  const instructionsId = useId()
  const today = dateValue(new Date())
  const month = monthFormat.format(calendarDate(visible))

  useEffect(() => {
    if (shouldFocus.current) {
      dates.current[focused]?.focus()
      shouldFocus.current = false
    }
  }, [focused, visible])

  function moveFocus(value: string) {
    shouldFocus.current = true
    setFocused(value)
    setVisible(value)
  }

  function onDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    let next: string | undefined
    const weekday = (calendarDate(day).getDay() + 6) % 7
    switch (event.key) {
      case 'ArrowLeft':
        next = moveDays(day, -1)
        break
      case 'ArrowRight':
        next = moveDays(day, 1)
        break
      case 'ArrowUp':
        next = moveDays(day, -7)
        break
      case 'ArrowDown':
        next = moveDays(day, 7)
        break
      case 'Home':
        next = moveDays(day, -weekday)
        break
      case 'End':
        next = moveDays(day, 6 - weekday)
        break
      case 'PageUp':
        next = moveMonths(day, event.shiftKey ? -12 : -1)
        break
      case 'PageDown':
        next = moveMonths(day, event.shiftKey ? 12 : 1)
        break
    }
    if (next) {
      event.preventDefault()
      if (next !== day) moveFocus(next)
    }
  }

  function changeMonth(amount: number) {
    const next = moveMonths(focused, amount)
    setFocused(next)
    setVisible(next)
  }

  return (
    <div className="grid min-w-0 gap-2 sm:col-span-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CalendarBlank aria-hidden="true" className="text-primary size-4" />
        Fechas de la ausencia
      </div>
      <div className="border-border bg-card overflow-hidden rounded-xl border">
        <div className="bg-muted/40 grid grid-cols-2 gap-3 border-b px-4 py-3">
          <div>
            <p className="text-muted-foreground text-xs">Desde</p>
            <p className="mt-1 text-sm font-medium">
              {start ? dateFormat.format(calendarDate(start)) : 'Selecciona un día'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">
              Hasta, incluido{endOptional ? ' · opcional' : ''}
            </p>
            <p className="mt-1 text-sm font-medium">
              {end
                ? dateFormat.format(calendarDate(end))
                : endOptional && start
                  ? 'Sin fecha de fin'
                  : 'Selecciona un día'}
            </p>
          </div>
        </div>
        <div className="mx-auto max-w-sm p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Mes anterior"
              onClick={() => changeMonth(-1)}
              className="hover:bg-muted focus-visible:ring-ring flex size-9 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:outline-none"
            >
              <CaretLeft aria-hidden="true" className="size-4" />
            </button>
            <p className="text-sm font-semibold capitalize" aria-live="polite">
              {month}
            </p>
            <button
              type="button"
              aria-label="Mes siguiente"
              onClick={() => changeMonth(1)}
              className="hover:bg-muted focus-visible:ring-ring flex size-9 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:outline-none"
            >
              <CaretRight aria-hidden="true" className="size-4" />
            </button>
          </div>
          <table
            role="grid"
            aria-label={`Calendario de ${month}`}
            aria-describedby={instructionsId}
            aria-multiselectable="true"
            className="w-full table-fixed border-collapse text-center"
          >
            <thead>
              <tr>
                {weekdays.map((day) => (
                  <th
                    key={day}
                    scope="col"
                    aria-label={day}
                    className="text-muted-foreground pb-2 text-xs font-medium"
                  >
                    {day.slice(0, 2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthWeeks(visible).map((week, index) => (
                <tr key={index}>
                  {week.map((day, column) => {
                    if (!day) return <td key={column} aria-label="Sin fecha" />
                    const selected = Boolean(start && day >= start && day <= (end || start))
                    const endpoint = day === start || day === end
                    return (
                      <td
                        key={day}
                        aria-selected={selected}
                        className={selected && !endpoint ? 'bg-accent/35' : ''}
                      >
                        <button
                          ref={(node) => {
                            dates.current[day] = node
                          }}
                          type="button"
                          aria-label={`${fullDateFormat.format(calendarDate(day))}${day === start ? ', inicio' : ''}${day === end ? ', fin' : ''}`}
                          aria-current={day === today ? 'date' : undefined}
                          tabIndex={day === focused ? 0 : -1}
                          onFocus={() => setFocused(day)}
                          onKeyDown={(event) => onDayKeyDown(event, day)}
                          onClick={() => {
                            const range = selectAbsenceDay(start, end, day)
                            onChange(range.start, range.end)
                          }}
                          className={`focus-visible:ring-ring mx-auto flex size-9 items-center justify-center rounded-full text-sm focus-visible:ring-2 focus-visible:outline-none ${endpoint ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-muted'} ${day === today && !endpoint ? 'decoration-primary font-bold underline underline-offset-4' : ''}`}
                        >
                          {calendarDate(day).getDate()}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
          <p id={instructionsId} className="text-muted-foreground text-xs">
            {!start
              ? 'Elige el primer día y después el último.'
              : !end
                ? endOptional
                  ? 'Elige el último día o déjalo sin fecha de fin.'
                  : 'Elige el último día. Para un solo día, selecciónalo de nuevo.'
                : 'El último día está incluido. Elige otro día para empezar de nuevo.'}{' '}
            Usa las flechas para moverte entre días y Av Pág o Re Pág para cambiar de mes.
          </p>
          {start ? (
            <button
              type="button"
              onClick={() => onChange('', '')}
              className="text-primary text-xs font-medium underline underline-offset-2"
            >
              Limpiar fechas
            </button>
          ) : null}
          {endOptional && end ? (
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
    </div>
  )
}
