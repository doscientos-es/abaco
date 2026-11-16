import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import { printDocument } from '@/shared/lib/print-document'

import type { MyDayTask } from '../application/my-day-tasks'
import type { PaperSnapshot } from '../application/paper-visit-actions'
import type { VisitSummary } from '../application/visit-actions'
import { PaperWorkSheet } from './paper-work-sheet'

type PaperReport = { visit: VisitSummary; snapshot: PaperSnapshot; tasks: MyDayTask[] }

export async function printWorkerPaperReport(
  visit: VisitSummary,
  snapshot: PaperSnapshot,
  tasks: MyDayTask[],
) {
  await printWorkerPaperReports([{ visit, snapshot, tasks }])
}

export async function printWorkerPaperReports(reports: PaperReport[]) {
  if (!reports.length) throw new Error('No hay partes para imprimir.')
  const element = document.createElement('div')
  const root = createRoot(element)
  try {
    flushSync(() =>
      root.render(
        <>
          {reports.map(({ visit, snapshot, tasks }) => (
            <PaperWorkSheet key={visit.id} visit={visit} snapshot={snapshot} tasks={tasks} />
          ))}
        </>,
      ),
    )
    await printDocument(element, reports.length === 1 ? 'Parte de trabajo' : 'Partes de trabajo')
  } finally {
    root.unmount()
  }
}
