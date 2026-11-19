import { Button, Input, Popover } from '@doscientos/ui'
import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react'

import type { WorkPlanningSearch } from '@/shared/domain/work-planning-search'
import { dateValue } from '@/shared/lib/date-range'
import { calendarStep } from '@/shared/lib/event-calendar'
import { FilterDisclosure } from '@/shared/ui/filter-disclosure'
import { SelectField, TextField } from '@/shared/ui/form'

import type { TechnicianOption, VisitStatus } from '../application/visit-actions'
import { calendarDateValue, calendarWeekLabel } from './agenda-calendar'
import type { AgendaPeriod, AgendaView } from './agenda-search'

const periods = { day: 'Día', week: 'Semana', month: 'Mes' } as const
const views = { calendar: 'Calendario', list: 'Lista' } as const
const monthLabel = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
const dayLabel = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export function PlanningToolbar({
  date,
  today,
  period,
  view,
  filters,
  technicians,
  teams,
  statusLabels,
  count,
  onChange,
  onCreate,
}: {
  date: string
  today: string
  period: AgendaPeriod
  view: AgendaView
  filters: WorkPlanningSearch
  technicians: TechnicianOption[]
  teams: { id: string; name: string }[]
  statusLabels: Record<VisitStatus, string>
  count: number | undefined
  onChange: (update: WorkPlanningSearch, replace?: boolean) => void
  onCreate: () => void
}) {
  const anchor = calendarDateValue(date)
  const heading =
    period === 'week'
      ? calendarWeekLabel(date)
      : (period === 'month' ? monthLabel : dayLabel).format(anchor)
  const selects = [
    {
      key: 'technician',
      label: 'Técnico',
      options: [
        { value: '', label: 'Todos los técnicos' },
        { value: 'unassigned', label: 'Sin persona ni equipo' },
        ...technicians.map(({ id, label }) => ({ value: id, label })),
      ],
    },
    {
      key: 'team',
      label: 'Equipo',
      options: [
        { value: '', label: 'Todos los equipos' },
        { value: 'unassigned', label: 'Sin equipo' },
        ...teams.map(({ id, name }) => ({ value: id, label: name })),
      ],
    },
    {
      key: 'status',
      label: 'Estado',
      options: [
        { value: '', label: 'Todos los estados' },
        ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
      ],
    },
  ] as const
  const active = selects.filter(({ key }) => filters[key])

  return (
    <section
      aria-label="Controles de planificación"
      className="border-border bg-card min-w-0 divide-y rounded-lg border"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Periodo anterior"
            onPress={() => onChange({ date: dateValue(calendarStep(anchor, period, -1)) })}
          >
            <CaretLeftIcon aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Periodo siguiente"
            onPress={() => onChange({ date: dateValue(calendarStep(anchor, period, 1)) })}
          >
            <CaretRightIcon aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" onPress={() => onChange({ date: today })}>
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
              className="min-w-0"
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
            value={date}
            onChange={(value) => {
              if (value) onChange({ date: value })
            }}
          />
        </Popover>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <fieldset className="bg-muted inline-flex items-center rounded-lg p-0.5">
            <legend className="sr-only">Periodo</legend>
            {(Object.keys(periods) as AgendaPeriod[]).map((id) => (
              <Button
                key={id}
                size="sm"
                variant={period === id ? 'outline' : 'ghost'}
                aria-pressed={period === id}
                onPress={() => onChange({ period: id })}
              >
                {periods[id]}
              </Button>
            ))}
          </fieldset>
          <fieldset className="flex items-center gap-0.5">
            <legend className="sr-only">Vista de trabajos</legend>
            {(Object.keys(views) as AgendaView[]).map((id) => (
              <Button
                key={id}
                size="sm"
                variant={view === id ? 'outline' : 'ghost'}
                aria-pressed={view === id}
                onPress={() => onChange({ view: id })}
              >
                {views[id]}
              </Button>
            ))}
          </fieldset>
          <Button size="sm" onPress={onCreate}>
            <PlusIcon aria-hidden="true" />
            Nueva visita
          </Button>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2">
        <div className="relative min-w-36 flex-1 sm:max-w-72">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            aria-label="Buscar cliente o centro"
            placeholder="Buscar cliente o centro…"
            className="h-9 pl-8"
            value={filters.q ?? ''}
            onChange={(event) => onChange({ q: event.target.value || undefined }, true)}
          />
        </div>
        <FilterDisclosure activeCount={active.length}>
          {selects.map(({ key, label, options }) => (
            <SelectField
              key={key}
              label={label}
              className="w-full"
              value={filters[key] ?? ''}
              options={[...options]}
              onChange={(value) => onChange({ [key]: value || undefined })}
            />
          ))}
        </FilterDisclosure>
        {active.map(({ key, label, options }) => {
          const selected = options.find((option) => option.value === filters[key])?.label ?? label
          return (
            <Button
              key={key}
              size="sm"
              variant="outline"
              className="max-w-full"
              aria-label={`Quitar filtro ${label}: ${selected}`}
              onPress={() => onChange({ [key]: undefined })}
            >
              <span className="truncate">{selected}</span>
              <XIcon aria-hidden="true" />
            </Button>
          )
        })}
        {active.length > 0 || filters.q ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={() =>
              onChange({ technician: undefined, team: undefined, status: undefined, q: undefined })
            }
          >
            Limpiar filtros
          </Button>
        ) : null}
        {count !== undefined ? (
          <output className="text-muted-foreground ml-auto text-xs tabular-nums">
            {count} {count === 1 ? 'trabajo' : 'trabajos'}
          </output>
        ) : null}
      </div>
    </section>
  )
}
