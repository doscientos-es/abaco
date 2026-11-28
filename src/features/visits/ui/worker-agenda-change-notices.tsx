import { Button } from '@doscientos/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'

import {
  listWorkerAgendaChangeNotices,
  markWorkerAgendaChangeSeen,
  type WorkerAgendaChangeNotice,
} from '../application/worker-agenda-change-notices'

const labels: Record<WorkerAgendaChangeNotice['change_kind'], string> = {
  assigned: 'Ahora tienes asignada esta visita',
  rescheduled: 'Cambió el horario',
  skipped: 'Visita omitida',
  canceled: 'Visita cancelada',
}

const localLabel = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
const inlineCount = 4

function dateTime(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'Hora no disponible' : localLabel.format(date)
}

function schedule(start: string | null, end: string | null, timezone: string | null) {
  if (!start || !end || !timezone) return null
  try {
    const date = new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    })
    return `${date.formatRange(new Date(start), new Date(end))} (${timezone})`
  } catch {
    return 'Horario no disponible'
  }
}

export function WorkerAgendaChangeNotices({
  tenantId,
  userId,
}: {
  tenantId: string
  userId: string
}) {
  const title = useId()
  const list = useId()
  const cache = useQueryClient()
  const [showAll, setShowAll] = useState(false)
  const acknowledgementPending = useRef(false)
  const focusAcknowledged = useRef<string | null>(null)
  const queryKey = ['worker-agenda-change-notices', tenantId, userId]
  const notices = useQuery({
    queryKey,
    queryFn: () => listWorkerAgendaChangeNotices(tenantId),
    staleTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  })
  const acknowledgement = useMutation({
    mutationFn: (id: string) => markWorkerAgendaChangeSeen(tenantId, id),
    onSuccess: async (seenAt, id) => {
      cache.setQueryData<WorkerAgendaChangeNotice[]>(queryKey, (current) =>
        current?.map((notice) => (notice.id === id ? { ...notice, seen_at: seenAt } : notice)),
      )
      await cache.invalidateQueries({ queryKey })
    },
    onError: async () => {
      focusAcknowledged.current = null
      await cache.invalidateQueries({ queryKey })
    },
    onSettled: () => {
      acknowledgementPending.current = false
    },
  })

  if (notices.isPending || (!notices.isFetchedAfterMount && notices.isFetching)) {
    return <output className="text-muted-foreground text-sm">Consultando cambios de agenda…</output>
  }
  if (notices.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
        No se pudieron consultar tus cambios de agenda.
        <Button variant="outline" onPress={() => void notices.refetch()}>
          Reintentar cambios
        </Button>
      </div>
    )
  }
  const items = notices.data ?? []
  if (!items.length) {
    return acknowledgement.isError ? (
      <p role="alert" className="text-destructive text-sm">
        {acknowledgement.error.message}
      </p>
    ) : null
  }
  const unseen = items.filter(({ seen_at }) => !seen_at).length

  return (
    <section
      aria-labelledby={title}
      className="border-border bg-card min-w-0 space-y-3 rounded-xl border p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={title} className="font-semibold">
          Cambios de agenda
        </h2>
        <output className="text-muted-foreground text-sm">
          {unseen} {unseen === 1 ? 'cambio sin ver' : 'cambios sin ver'} en esta lista
        </output>
      </div>
      <ul id={list} className="border-border divide-border divide-y rounded-lg border">
        {(showAll ? items : items.slice(0, inlineCount)).map((notice) => {
          const before = schedule(
            notice.before_start_at,
            notice.before_end_at,
            notice.before_timezone,
          )
          const after = schedule(notice.after_start_at, notice.after_end_at, notice.after_timezone)
          const changed = dateTime(notice.changed_at)
          return (
            <li key={notice.id} className="min-w-0 space-y-2 p-3 text-sm break-words">
              <div className="space-y-1">
                <p className="font-semibold">{notice.visit_title}</p>
                <p className="font-medium">{labels[notice.change_kind]}</p>
                <p className="text-muted-foreground">
                  Registrado: <time dateTime={notice.changed_at}>{changed}</time>
                </p>
                {before ? <p>Antes: {before}</p> : null}
                {after ? <p>Ahora: {after}</p> : null}
              </div>
              {notice.seen_at ? (
                <p
                  className="text-muted-foreground"
                  tabIndex={-1}
                  ref={(element) => {
                    if (element && focusAcknowledged.current === notice.id) {
                      element.focus()
                      focusAcknowledged.current = null
                    }
                  }}
                >
                  Visto: <time dateTime={notice.seen_at}>{dateTime(notice.seen_at)}</time>
                </p>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  aria-label={`Marcar como visto: ${notice.visit_title}, cambio del ${changed}`}
                  isDisabled={acknowledgement.isPending}
                  onPress={() => {
                    if (acknowledgementPending.current) return
                    acknowledgementPending.current = true
                    focusAcknowledged.current = notice.id
                    acknowledgement.mutate(notice.id)
                  }}
                >
                  Marcar como visto
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {items.length > inlineCount ? (
        <Button
          variant="ghost"
          aria-expanded={showAll}
          aria-controls={list}
          onPress={() => setShowAll((open) => !open)}
        >
          {showAll ? 'Ver menos cambios' : `Ver los ${items.length} cambios`}
        </Button>
      ) : null}
      {acknowledgement.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {acknowledgement.error instanceof Error
            ? acknowledgement.error.message
            : 'No se pudo marcar el cambio como visto.'}
        </p>
      ) : null}
    </section>
  )
}
