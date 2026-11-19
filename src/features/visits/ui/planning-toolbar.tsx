import { Button, Input } from '@doscientos/ui'
import { MagnifyingGlassIcon, PlusIcon, XIcon } from '@phosphor-icons/react'

import type { WorkPlanningSearch } from '@/shared/domain/work-planning-search'
import { calendarDate, dateValue } from '@/shared/lib/date-range'
import { CalendarToolbar } from '@/shared/ui/calendar-toolbar'
import { FilterDisclosure } from '@/shared/ui/filter-disclosure'
import { SelectField } from '@/shared/ui/form'

import type { TechnicianOption, VisitStatus } from '../application/visit-actions'
import type { AgendaPeriod, AgendaView } from './agenda-search'

const views = { calendar: 'Calendario', list: 'Lista' } as const

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
      <div className="px-3 py-2">
        <CalendarToolbar
          value={calendarDate(date)}
          view={period}
          today={calendarDate(today)}
          onDateChange={(value) => onChange({ date: dateValue(value) })}
          onViewChange={(period) => onChange({ period })}
          actions={
            <>
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
            </>
          }
        />
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
