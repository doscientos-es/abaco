import { Button } from '@doscientos/ui'
import { ArrowRightIcon, NotePencilIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import { calendarDate } from '@/shared/lib/date-range'

import { listMyVisits, type VisitSummary } from '../application/visit-actions'
import {
  listVisitReportLocalDrafts,
  listenToVisitReportLocalDrafts,
} from '../application/visit-report-local-draft'
import { localVisitDay } from '../domain/next-assigned-visit'
import { visitDraftRanges } from '../domain/visit-draft-ranges'

const emptySnapshot = () => '[]'
const dateLabel = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function WorkerPendingReports({
  dayVisits,
  onResume,
  tenantId,
  today,
  userId,
}: {
  dayVisits: readonly VisitSummary[]
  onResume: (date: string, contractId: string | null, visitId: string) => void
  tenantId: string
  today: string
  userId: string
}) {
  const raw = useSyncExternalStore(
    listenToVisitReportLocalDrafts,
    () => JSON.stringify(listVisitReportLocalDrafts(userId, tenantId)),
    emptySnapshot,
  )
  const localDrafts = JSON.parse(raw) as ReturnType<typeof listVisitReportLocalDrafts>
  const draftIds = new Set(localDrafts.map(({ visitId }) => visitId))
  const dayIds = new Set(dayVisits.map(({ id }) => id))
  const unresolved = localDrafts.filter(({ visitId }) => !dayIds.has(visitId))
  const ranges = visitDraftRanges(
    unresolved.map(({ day }) => day),
    today,
  )
  const otherDays = useQuery({
    queryKey: ['my-visits', tenantId, 'drafts', userId, ranges],
    enabled: unresolved.length > 0,
    queryFn: async () => {
      // Each request uses the existing assignment-scoped RPC, never browser metadata as authorization.
      // Limit concurrency while covering recorded dates, including older drafts.
      const matches: VisitSummary[] = []
      for (const { from, to } of ranges) matches.push(...(await listMyVisits(tenantId, from, to)))
      return matches
    },
  })
  const assigned = new Map(
    [...(otherDays.data ?? []), ...dayVisits]
      .filter(({ id }) => draftIds.has(id))
      .map((visit) => [visit.id, visit]),
  )
  const reports = [...assigned.values()].sort((a, b) =>
    b.scheduled_start_at.localeCompare(a.scheduled_start_at),
  )
  if (localDrafts.length === 0) return null
  return (
    <section
      aria-label="Partes pendientes en este dispositivo"
      className="border-border bg-card min-w-0 space-y-2 rounded-xl border p-4"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <NotePencilIcon aria-hidden="true" /> Partes pendientes en este dispositivo
      </h2>
      <p className="text-muted-foreground text-xs">
        Los borradores no se envían a la empresa hasta que guardes el parte.
      </p>
      {reports.length ? (
        <ul className="divide-border divide-y">
          {reports.map((visit) => {
            const day = localVisitDay(visit)
            return (
              <li
                key={visit.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium wrap-break-word">{visit.title}</p>
                  <time className="text-muted-foreground text-xs" dateTime={day}>
                    {dateLabel.format(calendarDate(day))}
                  </time>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  aria-label={`Continuar parte de ${visit.title}`}
                  onPress={() => onResume(day, visit.contract_id ?? null, visit.id)}
                >
                  Continuar parte <ArrowRightIcon aria-hidden="true" />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
      {unresolved.length && otherDays.isPending ? (
        <output className="text-muted-foreground text-sm">Buscando partes de otros días…</output>
      ) : null}
      {unresolved.length && otherDays.isError ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p role="alert">No se pudieron consultar los partes de otros días.</p>
          <Button size="sm" variant="outline" onPress={() => void otherDays.refetch()}>
            Reintentar partes
          </Button>
        </div>
      ) : null}
      {otherDays.isSuccess && reports.length < localDrafts.length ? (
        <p className="text-muted-foreground text-sm">
          Hay borradores sin una visita asignada en las fechas consultadas. Siguen en este
          dispositivo.
        </p>
      ) : null}
    </section>
  )
}
