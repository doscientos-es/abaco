import { Button } from '@doscientos/ui'
import { ArrowRightIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { calendarDate } from '@/shared/lib/date-range'
import { CalendarDetailsDialog } from '@/shared/ui/calendar-details-dialog'
import { WorkerLoading, WorkerState } from '@/shared/ui/worker-state'

import { listMyVisits } from '../application/visit-actions'
import { closedVisitHistoryRange, selectClosedVisitHistory } from '../domain/closed-visit-history'
import { localVisitDay } from '../domain/next-assigned-visit'
import { ClosedVisitReport } from './closed-visit-report'
import { WorkerVisitStatus } from './worker-visit-status'

const periodDate = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' })

export function WorkerClosedVisitHistory({
  today,
  tenantId,
  userId,
}: {
  today: string
  tenantId: string
  userId: string
}) {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { from, to } = closedVisitHistoryRange(today, page)
  const visits = useQuery({
    queryKey: ['my-visits', tenantId, 'history', userId, from, to],
    queryFn: () => listMyVisits(tenantId, from, to),
  })
  const closed = selectClosedVisitHistory(visits.data ?? [], search)
  const selected = visits.isSuccess ? closed.find(({ id }) => id === selectedId) : undefined
  const hasClosed = visits.data?.some(({ status }) => status === 'completed')

  return (
    <section aria-label="Historial de visitas cerradas" className="min-w-0 space-y-4">
      <div className="border-border bg-card grid min-w-0 gap-4 rounded-xl border p-4 sm:px-5">
        <div>
          <h2 className="font-semibold">Historial de visitas cerradas</h2>
          <p className="text-muted-foreground text-sm">
            Consulta los partes de tus visitas completadas, sin tener que buscar en el calendario.
          </p>
        </div>
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Buscar por visita, cliente o centro
          <input
            className="border-input bg-background min-h-11 min-w-0 rounded-lg border px-3"
            type="search"
            maxLength={160}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <output className="font-medium">
            {page === 0 ? 'Últimos 30 días · ' : ''}
            {periodDate.format(calendarDate(from))} al {periodDate.format(calendarDate(to))}
          </output>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onPress={() => setPage((value) => value + 1)}
            >
              <CaretLeftIcon aria-hidden="true" /> Anteriores
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              isDisabled={page === 0}
              onPress={() => setPage((value) => value - 1)}
            >
              Recientes <CaretRightIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
      {visits.isPending ? <WorkerLoading label="Cargando historial de visitas…" /> : null}
      {visits.isError ? (
        <WorkerState
          error
          title="No se pudo cargar el historial"
          description="Comprueba tu conexión e inténtalo de nuevo."
          onRetry={() => void visits.refetch()}
        />
      ) : null}
      {visits.isSuccess && !closed.length ? (
        <WorkerState
          title={
            hasClosed
              ? 'No coinciden visitas con tu búsqueda'
              : 'No hay visitas completadas en este periodo'
          }
          description={
            hasClosed
              ? 'Prueba con otro nombre de visita, cliente o centro.'
              : 'Consulta los 30 días anteriores para ver otras visitas.'
          }
          {...(hasClosed ? { actionLabel: 'Borrar búsqueda', onAction: () => setSearch('') } : {})}
        />
      ) : null}
      {closed.length ? (
        <ul className="space-y-2" aria-label="Visitas completadas">
          {closed.map((visit) => {
            const day = localVisitDay(visit)
            const customer = [visit.client_name, visit.location_name].filter(Boolean).join(' · ')
            return (
              <li
                key={visit.id}
                className="border-border bg-card flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium wrap-break-word">{visit.title}</p>
                  {customer ? (
                    <p className="text-muted-foreground text-sm wrap-break-word">{customer}</p>
                  ) : null}
                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                    <time dateTime={day}>{periodDate.format(calendarDate(day))}</time>
                    <WorkerVisitStatus status="completed" />
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  aria-label={`Ver parte cerrado de ${visit.title}`}
                  onPress={() => setSelectedId(visit.id)}
                >
                  Ver parte <ArrowRightIcon aria-hidden="true" />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
      {selected ? (
        <CalendarDetailsDialog
          title={selected.title}
          description={`Visita completada · ${periodDate.format(calendarDate(localVisitDay(selected)))}`}
          onClose={() => setSelectedId(null)}
        >
          <ClosedVisitReport tenantId={tenantId} visitId={selected.id} />
        </CalendarDetailsDialog>
      ) : null}
    </section>
  )
}
