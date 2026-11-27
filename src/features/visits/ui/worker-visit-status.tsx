import type { VisitSummary } from '../application/visit-actions'

const states = {
  scheduled: { label: 'Planificada', tone: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'En curso', tone: 'bg-primary/10 text-primary' },
  completed: { label: 'Completada', tone: 'bg-success/10 text-success' },
  skipped: { label: 'Omitida', tone: 'bg-muted text-muted-foreground' },
  canceled: { label: 'Cancelada', tone: 'bg-destructive/10 text-destructive' },
} as const

export function WorkerVisitStatus({ status }: { status: VisitSummary['status'] }) {
  const { label, tone } = states[status]
  return (
    <span
      className={`inline-flex w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {label}
    </span>
  )
}
