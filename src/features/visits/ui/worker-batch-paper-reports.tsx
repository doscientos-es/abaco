import { Button, toast } from '@doscientos/ui'
import { useEffect, useRef, useState } from 'react'

import { listMyDayTasks } from '../application/my-day-tasks'
import { loadPaperSnapshots } from '../application/paper-visit-actions'
import type { VisitSummary } from '../application/visit-actions'

export function WorkerBatchPaperReports({
  tenantId,
  visits,
  disabled,
}: {
  tenantId: string
  visits: VisitSummary[]
  disabled: boolean
}) {
  const [busy, setBusy] = useState(false)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const printable = visits.filter(
    (visit) => visit.status !== 'canceled' && visit.status !== 'skipped',
  )

  async function print() {
    if (busy || disabled || !printable.length) return
    setBusy(true)
    try {
      const [snapshots, work, printer] = await Promise.all([
        loadPaperSnapshots(
          tenantId,
          printable.map((visit) => visit.id),
        ),
        listMyDayTasks(tenantId, printable),
        import('./worker-paper-report-print'),
      ])
      const tasksByVisit = new Map(work.map((entry) => [entry.visitId, entry.tasks]))
      const reports = printable.map((visit) => {
        const snapshot = snapshots[visit.id]
        const tasks = tasksByVisit.get(visit.id)
        if (!snapshot || !tasks) throw new Error('No se pudieron cargar todos los partes.')
        return { visit, snapshot, tasks }
      })
      if (active.current) await printer.printWorkerPaperReports(reports)
    } catch (error) {
      if (active.current)
        toast.error('No se pudieron imprimir los partes', {
          description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        })
    } finally {
      if (active.current) setBusy(false)
    }
  }

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        isDisabled={disabled || busy || !printable.length}
        onPress={() => void print()}
      >
        Imprimir todos los partes ({printable.length})
      </Button>
      <p className="text-muted-foreground text-sm">
        Puedes imprimirlos o guardarlos juntos como PDF. No incluye visitas canceladas u omitidas.
      </p>
    </div>
  )
}
