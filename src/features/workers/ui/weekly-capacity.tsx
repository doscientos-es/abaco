import { Button } from '@doscientos/ui'
import { CaretDownIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { type WorkTeam } from '@/features/work-teams'
import { WorkerState } from '@/shared/ui/worker-state'

import { weeklyCapacityVisitsQuery } from '../application/weekly-capacity-queries'
import type { TeamCalendarRow } from '../domain/team-calendar'
import { projectWeeklyCapacity, weeklyCapacityBounds } from '../domain/weekly-capacity'

type CapacityProps = {
  tenantId: string
  userId: string
  from: string
  to: string
  rows: TeamCalendarRow[]
  companyPersonIds: string[]
  teams: WorkTeam[]
  general: boolean
}

const hoursFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })
const formatHours = (minutes: number) => `${hoursFormat.format(minutes / 60)} h`

export function WeeklyCapacity({
  expanded,
  onExpand,
  ...props
}: CapacityProps & { expanded: boolean; onExpand: (open: boolean) => void }) {
  const bounds = expanded ? weeklyCapacityBounds(props.from, props.to) : null
  return (
    <details
      className="group border-border bg-card rounded-xl border"
      open={expanded}
      onToggle={(event) => onExpand(event.currentTarget.open)}
    >
      <summary className="focus-visible:ring-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
        Capacidad semanal y carga
        <CaretDownIcon aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
      </summary>
      {expanded ? (
        <section aria-label="Capacidad semanal" className="border-border space-y-3 border-t p-3">
          <p className="text-muted-foreground text-sm">
            Compara los turnos con las horas de visita de las personas seleccionadas, aunque
            trabajen en varios equipos. No son horas fichadas.
          </p>
          {bounds ? (
            <CapacityResults {...props} bounds={bounds} />
          ) : (
            <p className="text-sm">No se pudo determinar el rango de esta semana.</p>
          )}
        </section>
      ) : null}
    </details>
  )
}

function CapacityResults({
  tenantId,
  userId,
  rows,
  companyPersonIds,
  teams,
  general,
  bounds,
}: CapacityProps & { bounds: { start: number; end: number } }) {
  const [all, setAll] = useState(false)
  const visits = useQuery(weeklyCapacityVisitsQuery(tenantId, userId, bounds))
  if (visits.isError)
    return (
      <WorkerState
        title="No se pudo cargar la carga de trabajo"
        description="El calendario sigue disponible. Sin las visitas no se puede comparar la semana."
        error
        onRetry={() => void visits.refetch()}
      />
    )
  if (visits.isPending)
    return (
      <output className="text-muted-foreground text-sm">Calculando la carga de la semana…</output>
    )

  const result = projectWeeklyCapacity({
    rows,
    companyPersonIds,
    teams,
    bounds,
    visits: visits.data,
  })
  const partial = result.unknownSchedules > 0 || result.unknownVisits > 0
  const chartMax = Math.max(1, result.capacity, result.planned)
  return (
    <>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div className="bg-muted/60 rounded-lg p-3">
          <dt className="text-muted-foreground text-xs font-medium">Turnos netos conocidos</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {result.unknownSchedules === rows.length
              ? 'Sin verificar'
              : formatHours(result.capacity)}
          </dd>
          {!partial ? <LoadBar value={result.capacity} max={chartMax} /> : null}
        </div>
        <div className="bg-muted/60 rounded-lg p-3">
          <dt className="text-muted-foreground text-xs font-medium">Horas de visita asignadas</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatHours(result.planned)}</dd>
          {!partial ? <LoadBar value={result.planned} max={chartMax} isLoad /> : null}
        </div>
      </dl>
      {partial ||
      result.pendingRequests > 0 ||
      result.overlap > 0 ||
      (general && result.unassignedVisits > 0) ? (
        <ul className="text-muted-foreground space-y-1 text-sm">
          {result.unknownSchedules ? (
            <li>
              <strong className="text-foreground">Turnos sin verificar:</strong>{' '}
              {result.unknownSchedules}{' '}
              {result.unknownSchedules === 1
                ? 'persona sin horario comprobable.'
                : 'personas sin horario comprobable.'}
            </li>
          ) : null}
          {result.unknownVisits ? (
            <li>
              <strong className="text-foreground">Asignaciones sin verificar.</strong> Algunas
              visitas no se pudieron atribuir por completo.
            </li>
          ) : null}
          {general && result.unassignedVisits ? (
            <li>
              <strong className="text-foreground">Visitas sin asignar:</strong>{' '}
              {formatHours(result.unassignedMinutes)} fuera de la carga de las personas.
            </li>
          ) : null}
          {result.overlap > 0 ? (
            <li>
              <strong className="text-foreground">Carga solapada:</strong>{' '}
              {formatHours(result.overlap)} de visitas coinciden para la misma persona; se muestran
              ambos compromisos.
            </li>
          ) : null}
          {result.pendingRequests ? (
            <li>Las solicitudes pendientes no reducen los turnos.</li>
          ) : null}
        </ul>
      ) : null}
      {result.people.length > 0 ? (
        <div>
          <h4 className="mb-1 text-sm font-semibold">Por persona</h4>
          <ul className="divide-border divide-y">
            {(all ? result.people : result.people.slice(0, 5)).map((person) => (
              <li
                key={person.userId}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2"
              >
                <span className="min-w-0 text-sm font-medium break-words">{person.name}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatHours(person.planned)} de visitas ·{' '}
                  {person.capacity === null
                    ? 'turno sin verificar'
                    : `${formatHours(person.capacity)} de turno`}
                </span>
              </li>
            ))}
          </ul>
          {result.people.length > 5 ? (
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              aria-expanded={all}
              onPress={() => setAll(!all)}
            >
              {all ? 'Ver menos' : `Ver ${result.people.length - 5} personas más`}
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Los turnos descuentan solo ausencias aprobadas. Las visitas de equipo suman una vez por
        integrante. La comparación usa los horarios y equipos actuales, en hora peninsular.
        {result.daylightSavingWeek
          ? ' Esta semana cambia la hora; los turnos conservan su duración configurada.'
          : ''}
      </p>
    </>
  )
}

function LoadBar({ value, max, isLoad = false }: { value: number; max: number; isLoad?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="bg-muted-foreground/15 mt-2 h-2 overflow-hidden rounded-full"
    >
      <div
        className={
          isLoad ? 'bg-primary h-full rounded-full' : 'bg-muted-foreground h-full rounded-full'
        }
        style={{ width: `${(value / max) * 100}%` }}
      />
    </div>
  )
}
