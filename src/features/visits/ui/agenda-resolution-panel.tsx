import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { moveDays } from '@/shared/lib/date-range'
import { CalendarDetailsDialog } from '@/shared/ui/calendar-details-dialog'

import {
  agendaResolutionAbsencesQuery,
  agendaResolutionVisitsQuery,
} from '../application/agenda-resolution-queries'
import type { TechnicianOption, VisitSummary } from '../application/visit-actions'
import { agendaResolution } from '../domain/agenda-resolution'
import { VisitReplanForm } from './visit-replan-form'

const labels = {
  unassigned: 'Sin persona ni equipo',
  'approved-absence': 'Ausencia confirmada',
  'assignment-unknown': 'Asignación sin verificar',
}

export function AgendaResolutionPanel({
  tenantId,
  today,
  technicians,
  editingState,
  onRetryTechnicians,
  onSaved,
}: {
  tenantId: string
  today: string
  technicians: TechnicianOption[]
  editingState: 'ready' | 'loading' | 'error'
  onRetryTechnicians: () => void
  onSaved: () => Promise<void>
}) {
  const [dayIndex, setDayIndex] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<VisitSummary | null>(null)
  const visits = useQuery(agendaResolutionVisitsQuery(tenantId, today))
  const absences = useQuery(agendaResolutionAbsencesQuery(tenantId, today))
  const days = [today, moveDays(today, 1)] as const
  const results = days.map((day) =>
    agendaResolution(
      visits.isSuccess ? visits.data : [],
      absences.isSuccess ? absences.data : undefined,
      day,
    ),
  )
  const result = results[dayIndex] ?? results[0]
  const entries = result?.entries ?? []
  const confirmed = entries.filter(({ kind }) => kind !== 'assignment-unknown')
  const unknown = entries.length - confirmed.length
  const needsAbsenceCheck = Boolean(result?.uncheckedAbsences)
  const apparentTotal = (index: number) =>
    results[index]?.entries.filter(({ kind }) => kind !== 'assignment-unknown').length ?? 0

  return (
    <section
      aria-label="Por resolver"
      className="border-border bg-card space-y-3 rounded-xl border p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Por resolver</h2>
        <fieldset className="flex gap-1">
          <legend className="sr-only">Día de las visitas por resolver</legend>
          {['Hoy', 'Mañana'].map((label, index) => (
            <Button
              key={label}
              variant={dayIndex === index ? 'default' : 'outline'}
              size="sm"
              className="max-md:min-h-11"
              aria-pressed={dayIndex === index}
              onPress={() => {
                setDayIndex(index)
                setShowAll(false)
              }}
            >
              {label}
              {visits.isSuccess && apparentTotal(index) > 0 ? (
                <span className="tabular-nums">{apparentTotal(index)}</span>
              ) : null}
            </Button>
          ))}
        </fieldset>
      </div>
      {visits.isPending ? (
        <output className="text-muted-foreground text-sm">Comprobando las próximas visitas…</output>
      ) : null}
      {visits.isError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p>No se pudieron comprobar las próximas visitas.</p>
          <Button size="sm" variant="outline" onPress={() => void visits.refetch()}>
            Reintentar visitas
          </Button>
        </div>
      ) : null}
      {visits.isSuccess && needsAbsenceCheck && absences.isPending ? (
        <output className="text-muted-foreground text-sm">
          Comprobando ausencias confirmadas…
        </output>
      ) : null}
      {visits.isSuccess && needsAbsenceCheck && absences.isError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p>No se pudieron comprobar las ausencias confirmadas.</p>
          <Button size="sm" variant="outline" onPress={() => void absences.refetch()}>
            Reintentar ausencias
          </Button>
        </div>
      ) : null}
      {visits.isSuccess && unknown > 0 ? (
        <p className="text-muted-foreground text-sm">
          {unknown}{' '}
          {unknown === 1
            ? 'visita con asignación sin verificar'
            : 'visitas con asignación sin verificar'}
          .
        </p>
      ) : null}
      {visits.isSuccess && !entries.length && !needsAbsenceCheck ? (
        <p className="text-muted-foreground text-sm">
          No hay incidencias de asignación detectadas para este día.
        </p>
      ) : null}
      {visits.isSuccess && confirmed.length && editingState === 'loading' ? (
        <output className="text-muted-foreground text-sm">Cargando la lista de técnicos…</output>
      ) : null}
      {visits.isSuccess && confirmed.length && editingState === 'error' ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p>No se pudo cargar la lista de técnicos para reprogramar.</p>
          <Button size="sm" variant="outline" onPress={onRetryTechnicians}>
            Reintentar técnicos
          </Button>
        </div>
      ) : null}
      {entries.length ? (
        <>
          <ol className="divide-border divide-y">
            {(showAll ? entries : entries.slice(0, 3)).map(({ visit, kind }) => (
              <li
                key={visit.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
              >
                <div className="min-w-0 flex-1 basis-36">
                  <p className="text-sm font-medium break-words">
                    <time className="tabular-nums" dateTime={visit.scheduled_start_at}>
                      {new Date(visit.scheduled_start_at).toLocaleTimeString('es-ES', {
                        timeZone: visit.timezone,
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    {' · '}
                    {visit.title}
                  </p>
                  <p className="text-muted-foreground text-xs break-words">
                    {visit.client_name}
                    {visit.location_name ? ` · ${visit.location_name}` : ''}
                  </p>
                  <p
                    className={
                      kind === 'assignment-unknown'
                        ? 'text-muted-foreground text-xs'
                        : 'text-foreground text-xs font-semibold'
                    }
                  >
                    {labels[kind]}
                  </p>
                </div>
                {kind !== 'assignment-unknown' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="max-md:min-h-11"
                    aria-label={`Reprogramar ${visit.title}`}
                    isDisabled={editingState !== 'ready'}
                    onPress={() => setSelected(visit)}
                  >
                    Reprogramar
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
          {entries.length > 3 ? (
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={showAll}
              onPress={() => setShowAll(!showAll)}
            >
              {showAll ? 'Ver menos' : `Ver ${entries.length - 3} más`}
            </Button>
          ) : null}
        </>
      ) : null}
      {selected ? (
        <CalendarDetailsDialog
          title="Resolver asignación"
          description={selected.title}
          onClose={() => setSelected(null)}
          preventDismissal={saving}
        >
          <VisitReplanForm
            key={`${selected.id}:${selected.updated_at}`}
            tenantId={tenantId}
            visit={selected}
            technicians={technicians}
            onDone={async () => {
              await onSaved()
              setSelected(null)
            }}
            onCancel={() => setSelected(null)}
            onPendingChange={setSaving}
          />
        </CalendarDetailsDialog>
      ) : null}
    </section>
  )
}
