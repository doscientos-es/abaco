import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

import type { VisitSummary } from '../application/visit-actions'

vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Page: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  StyleSheet: { create: (styles: unknown) => styles },
  pdf: vi.fn(),
}))

import { WorkerPaperReportDocument } from './worker-paper-report-pdf'

it('includes scheduled contract tasks, work order details, instructions and a handwritten signature', () => {
  const visit: VisitSummary = {
    id: 'visit',
    title: 'Limpieza',
    client_name: 'Cliente',
    location_name: 'Centro',
    address: '',
    timezone: 'Europe/Madrid',
    status: 'scheduled',
    priority: 'normal',
    notes: '',
    scheduled_start_at: '2099-11-13T08:00:00Z',
    scheduled_end_at: '2099-11-13T09:00:00Z',
    updated_at: '',
  }
  const html = renderToStaticMarkup(
    <WorkerPaperReportDocument
      visit={visit}
      snapshot={{
        tasks: 'Suelo',
        scheduledTasks: [{ title: 'Cristales', startMinute: 480, durationMinutes: 60 }],
        instructions: 'Entrada lateral',
      }}
      tasks={[
        {
          id: 'task',
          phase_id: 'phase',
          position: 0,
          title: 'Baños',
          notes: 'Desinfectar',
          status: 'pending',
          updated_at: '',
          phaseTitle: 'Limpieza',
          checklist: [{ id: 'item', label: 'Lavabos', done: false }],
        },
      ]}
    />,
  )
  for (const text of [
    'Suelo',
    'Cristales',
    'Baños',
    'Desinfectar',
    'Lavabos',
    'Entrada lateral',
    'Firma y sello',
    'se consideran realizados',
  ]) {
    expect(html).toContain(text)
  }
})
