import { Link } from '@tanstack/react-router'

import { plannedTime, type TeamCalendarCell, type teamCalendarDays } from '../domain/team-calendar'

const dayName = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' })
const wholeDay = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export function TeamWeekGrid({
  days,
  rows,
  selectedDate,
  onDayChange,
}: {
  days: ReturnType<typeof teamCalendarDays>
  rows: { userId: string; name: string; cells: TeamCalendarCell[] }[]
  selectedDate: string
  onDayChange: (date: string) => void
}) {
  const selectedIndex = Math.max(
    days.findIndex((day) => day.value === selectedDate),
    0,
  )
  const selected = days[selectedIndex]?.day
  return (
    <div className="space-y-3">
      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        <li>
          {rows.length} {rows.length === 1 ? 'persona' : 'personas'}
        </li>
        <li>
          {rows.filter((row) => row.cells.some((cell) => cell.approved)).length} con ausencia
          aprobada
        </li>
        <li>
          {rows.filter((row) => row.cells.some((cell) => cell.pending)).length} con solicitud
          pendiente
        </li>
      </ul>
      <div className="space-y-3 xl:hidden">
        <nav aria-label="Día de la semana" className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {days.map(({ day, value }, index) => (
            <button
              key={value}
              type="button"
              aria-label={wholeDay.format(day)}
              aria-pressed={index === selectedIndex}
              onClick={() => onDayChange(value)}
              className="border-border focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground hover:bg-muted min-h-11 min-w-0 rounded-md border text-xs font-semibold capitalize focus-visible:ring-2 sm:text-sm"
            >
              {dayName.format(day)}
            </button>
          ))}
        </nav>
        <h4 className="text-muted-foreground text-sm font-medium capitalize">
          {selected ? wholeDay.format(selected) : ''}
        </h4>
        <ul className="border-border bg-card divide-border divide-y rounded-xl border">
          {rows.map((row) => (
            <li key={row.userId} className="flex flex-wrap justify-between gap-3 p-3">
              <WorkerLink person={row} selectedDate={selectedDate} />
              {row.cells[selectedIndex] ? <DayCell cell={row.cells[selectedIndex]} /> : null}
            </li>
          ))}
        </ul>
      </div>
      <div className="border-border bg-card hidden max-w-full overflow-x-auto rounded-xl border xl:block">
        <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">Horarios previstos y ausencias de la semana</caption>
          <thead className="bg-muted">
            <tr>
              <th scope="col" className="min-w-36 p-3 font-semibold">
                Trabajador
              </th>
              {days.map(({ day, value }) => (
                <th key={value} scope="col" className="min-w-24 p-3 font-semibold capitalize">
                  <span aria-hidden="true">{dayName.format(day)}</span>
                  <span className="sr-only">{wholeDay.format(day)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId}>
                <th scope="row" className="border-border border-t p-3 align-top">
                  <WorkerLink person={row} selectedDate={selectedDate} />
                </th>
                {row.cells.map((cell, index) => (
                  <td key={days[index]?.value} className="border-border border-t p-2.5 align-top">
                    <DayCell cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WorkerLink({
  person,
  selectedDate,
}: {
  person: { userId: string; name: string }
  selectedDate: string
}) {
  return (
    <Link
      to="/trabajadores"
      search={{ vista: 'calendario', persona: person.userId, fecha: selectedDate }}
      className="text-foreground max-w-52 text-sm font-semibold break-words underline-offset-4 hover:underline"
    >
      {person.name}
    </Link>
  )
}

function DayCell({ cell }: { cell: TeamCalendarCell }) {
  return (
    <div className="space-y-1.5 text-xs">
      {cell.approved ? (
        <p className="bg-muted text-foreground rounded-md px-2 py-1 font-medium">
          Ausencia aprobada
        </p>
      ) : null}
      {cell.pending ? (
        <p className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Solicitud pendiente
        </p>
      ) : null}
      {cell.plannedSlots?.length ? (
        <ul
          aria-label={cell.approved ? 'Horario habitual durante la ausencia' : 'Turno previsto'}
          className="space-y-0.5"
        >
          {cell.plannedSlots.map(({ start, end }) => (
            <li
              key={`${start}:${end}`}
              className={
                cell.approved
                  ? 'text-muted-foreground tabular-nums'
                  : 'text-primary bg-primary/10 rounded-md px-2 py-1 font-semibold tabular-nums'
              }
            >
              {cell.approved ? 'Previsto: ' : ''}
              {plannedTime(start)}–{plannedTime(end)}
            </li>
          ))}
        </ul>
      ) : !cell.approved && !cell.pending ? (
        <p className="text-muted-foreground">{cell.plannedSlots ? 'Sin turno' : 'Sin horario'}</p>
      ) : null}
    </div>
  )
}
