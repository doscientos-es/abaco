import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { VisitSummary } from '../application/visit-actions'

const mocks = vi.hoisted(() => ({
  downloadAction: undefined as (() => void) | undefined,
  snapshots: vi.fn(),
  tasks: vi.fn(),
  pdf: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@doscientos/ui', () => ({
  Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => {
    if (children === 'Descargar parte PDF') mocks.downloadAction = onPress
    return <button>{children}</button>
  },
  toast: { error: mocks.error, success: vi.fn() },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [] }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('../application/my-day-tasks', () => ({ listMyDayTasks: mocks.tasks }))
vi.mock('../application/paper-visit-actions', () => ({
  loadPaperSnapshots: mocks.snapshots,
  listSignedDocuments: vi.fn(),
  uploadSignedDocument: vi.fn(),
  openSignedDocument: vi.fn(),
}))
vi.mock('./worker-paper-report-pdf', () => ({ downloadWorkerPaperReport: mocks.pdf }))

import { WorkerPaperReport } from './worker-paper-report'

const visit: VisitSummary = {
  id: 'future-visit',
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
  updated_at: '2026-11-13T08:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.downloadAction = undefined
  mocks.snapshots.mockResolvedValue({
    'future-visit': { scheduledTasks: [{ title: 'Limpieza diaria' }] },
  })
  mocks.tasks.mockResolvedValue([{ visitId: visit.id, tasks: [{ title: 'Cristales' }] }])
  mocks.pdf.mockResolvedValue(undefined)
})

describe('worker paper report', () => {
  it('downloads the scheduled future visit without starting it and includes its tasks', async () => {
    const html = renderToStaticMarkup(<WorkerPaperReport tenantId="tenant" visit={visit} />)
    expect(html).toContain('Descargar parte PDF')
    expect(html).toContain('Adjuntar parte firmado (opcional)')
    mocks.downloadAction?.()
    await vi.waitFor(() =>
      expect(mocks.pdf).toHaveBeenCalledWith(
        visit,
        { scheduledTasks: [{ title: 'Limpieza diaria' }] },
        [{ title: 'Cristales' }],
      ),
    )
    expect(mocks.snapshots).toHaveBeenCalledWith('tenant', [visit.id])
  })

  it('does not create an incomplete PDF if the visit snapshot cannot be read', async () => {
    mocks.snapshots.mockResolvedValue({})
    renderToStaticMarkup(<WorkerPaperReport tenantId="tenant" visit={visit} />)
    mocks.downloadAction?.()
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(mocks.pdf).not.toHaveBeenCalled()
  })
})
