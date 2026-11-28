import type { VisitSummary } from '../application/visit-actions'

const originalDateFormat = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

function formatOccurrenceDate(date: string) {
  return originalDateFormat.format(new Date(`${date}T12:00:00Z`))
}

export function VisitOccurrenceReference({ date }: { date: string | null | undefined }) {
  if (!date) return null
  return (
    <p className="text-muted-foreground text-xs">
      Visita recurrente · Fecha original: {formatOccurrenceDate(date)}
    </p>
  )
}

export function VisitOccurrenceScope({
  visit,
  action,
  next,
}: {
  visit: VisitSummary
  action: 'move' | 'skip'
  next?: { localStart: string; durationMinutes: number } | undefined
}) {
  if (!visit.contract_occurrence_on) return null
  const original = formatOccurrenceDate(visit.contract_occurrence_on)
  const scheduled = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: visit.timezone,
  }).format(new Date(visit.scheduled_start_at))
  return (
    <div className="border-border bg-card min-w-0 space-y-1 rounded-md border p-3 text-sm">
      <p className="font-semibold">Alcance: solo esta visita</p>
      {visit.contract_title ? (
        <p className="break-words">Contrato: {visit.contract_title}</p>
      ) : null}
      <p>Fecha original de la serie: {original}</p>
      <p>
        Programada ahora: {scheduled} ({visit.timezone})
      </p>
      {action === 'move' && next ? (
        <p>
          Nuevo inicio: {formatOccurrenceDate(next.localStart.slice(0, 10))},{' '}
          {next.localStart.slice(11)} · {next.durationMinutes} min
        </p>
      ) : null}
      <p className="text-muted-foreground">
        {action === 'skip'
          ? 'Quedará como omitida en el historial. Las demás visitas de la serie no cambian.'
          : 'Se conserva su referencia original y su historial. Las demás visitas de la serie no cambian.'}
      </p>
    </div>
  )
}
