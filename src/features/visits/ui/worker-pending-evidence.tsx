import { Button } from '@doscientos/ui'
import { ArrowRightIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'

import { calendarDate, moveDays } from '@/shared/lib/date-range'
import { WorkerLoading, WorkerState } from '@/shared/ui/worker-state'

import {
  evidenceKinds,
  listLocalVisitEvidence,
  type EvidenceKind,
} from '../application/pending-visit-evidence'
import { listMyVisits } from '../application/visit-actions'
import { localVisitDay } from '../domain/next-assigned-visit'

const dateLabel = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' })
const labels = {
  photos: { singular: 'foto', plural: 'fotos', action: 'Gestionar fotos' },
  incidents: { singular: 'incidencia', plural: 'incidencias', action: 'Gestionar incidencias' },
  activity: {
    singular: 'registro de actividad',
    plural: 'registros de actividad',
    action: 'Gestionar actividad',
  },
} satisfies Record<EvidenceKind, { singular: string; plural: string; action: string }>

export function WorkerPendingEvidence({
  tenantId,
  userId,
  today,
  onOpen,
}: {
  tenantId: string
  userId: string
  today: string
  onOpen: (day: string, contractId: string | null, visitId: string, section: EvidenceKind) => void
}) {
  const local = useQuery({
    queryKey: ['pending-visit-evidence', tenantId, userId],
    queryFn: () => listLocalVisitEvidence(userId, tenantId),
    refetchOnMount: 'always',
    networkMode: 'always',
  })
  const count = local.data?.byVisit.size ?? 0
  const from = moveDays(today, -24)
  const to = moveDays(today, 7)
  const assigned = useQuery({
    queryKey: ['my-visits', tenantId, 'evidence', userId, from, to],
    queryFn: () => listMyVisits(tenantId, from, to),
    enabled: count > 0,
    refetchOnMount: 'always',
  })
  // Don't present retry affordances using only stale assignment cache.
  const visible =
    assigned.isSuccess && assigned.isFetchedAfterMount
      ? (assigned.data ?? []).filter((visit) => local.data?.byVisit.has(visit.id))
      : []
  const unavailable = local.data?.unavailable ?? []

  return (
    <section aria-label="Envíos pendientes" className="min-w-0 space-y-4">
      <div className="border-border bg-card space-y-1 rounded-xl border p-4 sm:px-5">
        <h2 className="font-semibold">Envíos pendientes</h2>
        <p className="text-muted-foreground text-sm">
          Fotos, incidencias y actividad guardadas en este dispositivo. Solo se envían cuando tú lo
          indicas.
        </p>
      </div>
      {local.isPending ||
      (count > 0 && (assigned.isPending || assigned.isFetching) && !assigned.isPaused) ? (
        <WorkerLoading label="Buscando envíos pendientes…" />
      ) : null}
      {local.isError || unavailable.length ? (
        <div className="border-border bg-card flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          <p role="alert">
            No se pudieron comprobar{' '}
            {unavailable.length
              ? unavailable.map((kind) => labels[kind].plural).join(', ')
              : 'los envíos de este dispositivo'}
            .
          </p>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            isDisabled={local.isFetching}
            onPress={() => void local.refetch()}
          >
            Actualizar envíos
          </Button>
        </div>
      ) : null}
      {count > 0 && (assigned.isError || assigned.isPaused) ? (
        <WorkerState
          error
          title="No se pudieron comprobar tus visitas asignadas"
          description="Los envíos siguen en este dispositivo. Cuando tengas conexión podrás abrir su visita."
          onRetry={() => void assigned.refetch()}
        />
      ) : null}
      {local.isSuccess && !count && !unavailable.length ? (
        <WorkerState
          title="No tienes envíos pendientes"
          description="Aquí aparecerán los elementos que prepares en los partes de visita."
        />
      ) : null}
      {visible.length ? (
        <ul className="space-y-2" aria-label="Visitas con envíos pendientes">
          {visible.map((visit) => {
            const day = localVisitDay(visit)
            const counts = local.data?.byVisit.get(visit.id)
            const closed = visit.status !== 'scheduled' && visit.status !== 'in_progress'
            return (
              <li
                key={visit.id}
                className="border-border bg-card min-w-0 space-y-2 rounded-lg border p-3"
              >
                <p className="font-medium wrap-break-word">{visit.title}</p>
                <p className="text-muted-foreground text-sm wrap-break-word">
                  {visit.location_name ? `${visit.location_name} · ` : ''}
                  <time dateTime={day}>{dateLabel.format(calendarDate(day))}</time>
                </p>
                {closed ? (
                  <p className="text-muted-foreground text-sm">
                    Visita cerrada. Los envíos no modifican el parte cerrado.
                  </p>
                ) : null}
                <ul className="divide-border divide-y">
                  {evidenceKinds.map((kind) => {
                    const items = counts?.[kind] ?? 0
                    const label = labels[kind]
                    if (!items) return null
                    return (
                      <li
                        key={kind}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                      >
                        <span>
                          {items} {items === 1 ? label.singular : label.plural}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-11"
                          aria-label={`${label.action} de ${visit.title}`}
                          onPress={() => onOpen(day, visit.contract_id ?? null, visit.id, kind)}
                        >
                          {label.action} <ArrowRightIcon aria-hidden="true" />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            )
          })}
        </ul>
      ) : null}
      {assigned.isSuccess && assigned.isFetchedAfterMount && count > visible.length ? (
        <p className="text-muted-foreground text-sm">
          Hay envíos de visitas que ya no están asignadas o están fuera de los días consultados (24
          anteriores y 7 siguientes). No se han enviado ni eliminado.
        </p>
      ) : null}
    </section>
  )
}
