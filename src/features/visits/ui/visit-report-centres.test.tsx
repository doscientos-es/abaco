import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ClosedVisitReport } from './closed-visit-report'
import { PublicVisitReportPage } from './public-visit-report-page'

const state = vi.hoisted(() => ({ data: {} as Record<string, unknown> }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: state.data }) }))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}))
vi.mock('../application/visit-report-actions', () => ({ loadClosedVisitReport: vi.fn() }))
vi.mock('../application/public-visit-report-actions', () => ({
  loadPublicVisitReport: vi.fn(),
  getPublicVisitReportPdfUrl: vi.fn(),
}))

describe('centre-based visit reports', () => {
  it('renders the public report without legacy pool sections even when the snapshot has them', () => {
    state.data = {
      version: 1,
      closedAt: '2026-11-10T10:00:00Z',
      company: { name: 'Company TEST' },
      client: { name: 'Client TEST' },
      location: { name: 'Office centre', address: 'Test address' },
      asset: { name: 'Legacy pool TEST' },
      visit: { title: 'Office cleaning', actualStartAt: '', actualEndAt: '' },
      report: {
        notes: 'Cleaning completed',
        checklist: [{ label: 'Floor cleaned', done: true }],
        recommendations: '',
        nextActions: '',
      },
      measurements: [{ label: 'Legacy pH TEST', value: 7.2, unit: '', assessment: 'within' }],
      activities: [],
      incidents: [],
      photos: [],
    }
    const html = renderToStaticMarkup(<PublicVisitReportPage token="test-report-reference" />)
    expect(html).toContain('Office centre')
    expect(html).toContain('Floor cleaned')
    expect(html).toContain('Descargar PDF')
    expect(html).not.toMatch(/Instalación|Mediciones|Legacy pool|Legacy pH/)
  })

  it('preserves closed report tasks and notes without a pool measurements section', () => {
    state.data = {
      version: 1,
      closed_at: '2026-11-10T10:00:00Z',
      snapshot: {
        client: { name: 'Client TEST' },
        location: { name: 'Office centre', address: 'Test address' },
        report: { data: { notes: 'Cleaning completed', checklist: [] } },
        tasks: [{ id: 'task', title: 'Floor cleaned', status: 'completed', phase: 'Cleaning' }],
        measurements: [
          { id: 'reading', label: 'Legacy pH TEST', value: 7.2, unit: '', assessment: 'within' },
        ],
        activities: [],
        incidents: [],
      },
    }
    const html = renderToStaticMarkup(<ClosedVisitReport tenantId="tenant" visitId="visit" />)
    expect(html).toContain('Office centre')
    expect(html).toContain('Cleaning completed')
    expect(html).toContain('Floor cleaned')
    expect(html).not.toMatch(/Mediciones|Legacy pH/)
  })
})
