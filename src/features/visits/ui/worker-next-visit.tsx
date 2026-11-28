import { Button } from '@doscientos/ui'
import { ArrowRightIcon, ClockIcon } from '@phosphor-icons/react'

import { calendarDate } from '@/shared/lib/date-range'
import { VisitMapsAction } from '@/shared/ui/contact-actions'

import type { VisitSummary } from '../application/visit-actions'
import { localVisitDay } from '../domain/next-assigned-visit'

const weekday = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export function WorkerNextVisit({
  visit,
  today,
  now,
  onOpen,
}: {
  visit: VisitSummary
  today: string
  now: number
  onOpen: (date: string, contractId: string | null, visitId: string) => void
}) {
  const day = localVisitDay(visit)
  const label =
    day === today
      ? Date.parse(visit.scheduled_start_at) <= now
        ? 'Pendiente de iniciar'
        : 'Hoy'
      : weekday.format(calendarDate(day))
  const time = new Date(visit.scheduled_start_at).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: visit.timezone,
  })
  return (
    <section
      aria-label="Siguiente visita"
      className="border-primary/20 bg-primary/5 grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div className="min-w-0 space-y-1">
        <h2 className="text-primary flex items-center gap-1.5 text-xs font-semibold">
          <ClockIcon aria-hidden="true" /> Siguiente visita
        </h2>
        <p className="text-base font-semibold wrap-break-word">{visit.title}</p>
        <p className="text-muted-foreground text-sm wrap-break-word">
          <span className="font-medium capitalize">{label}</span> ·{' '}
          <time dateTime={visit.scheduled_start_at}>{time}</time>
          {visit.location_name ? ` · ${visit.location_name}` : null}
        </p>
        <VisitMapsAction
          address={visit.address}
          addressMayBeIncomplete
          label={`Cómo llegar a la siguiente visita, ${visit.title}, en Google Maps`}
        />
      </div>
      <Button
        variant="outline"
        className="min-h-11 justify-center"
        onPress={() => onOpen(day, visit.contract_id ?? null, visit.id)}
      >
        Ver visita <ArrowRightIcon aria-hidden="true" />
      </Button>
    </section>
  )
}
