import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sendQueuedVisitReport } from './send-queued-visit-report'
import { listMyVisits, type VisitSummary } from './visit-actions'
import {
  loadVisitReport,
  loadVisitReportReceipt,
  requireVisitReportActor,
  saveVisitReport,
} from './visit-report-actions'
import { prepareWorkerDay } from './worker-offline-day'

vi.mock('./visit-actions', () => ({ listMyVisits: vi.fn() }))
vi.mock('./visit-report-actions', () => ({
  loadVisitReport: vi.fn(),
  loadVisitReportReceipt: vi.fn(),
  requireVisitReportActor: vi.fn(),
  saveVisitReport: vi.fn(),
}))

const date = '2026-11-28'
const visit = {
  id: 'visit',
  title: 'Intervención ficticia',
  client_name: 'Cliente privado',
  location_name: 'Centro privado',
  address: 'Dirección privada',
  notes: 'Notas operativas privadas',
  timezone: 'Europe/Madrid',
  scheduled_start_at: `${date}T08:00:00Z`,
  scheduled_end_at: `${date}T09:00:00Z`,
  status: 'in_progress',
  priority: 'normal',
  updated_at: `${date}T08:00:00Z`,
  work_order_id: 'office-ref',
} satisfies VisitSummary
const command = {
  tenantId: 'company',
  userId: 'worker',
  visitId: visit.id,
  day: date,
  stillActive: () => true,
  draft: {
    baseRevision: 0,
    data: { notes: 'Trabajo sin cobertura', checklist: [] },
    operationId: 'operation-1',
    delivery: 'queued' as const,
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listMyVisits).mockResolvedValue([visit])
  vi.mocked(loadVisitReport).mockResolvedValue(null)
  vi.mocked(loadVisitReportReceipt).mockResolvedValue(null)
  vi.mocked(requireVisitReportActor).mockResolvedValue(undefined)
  vi.mocked(saveVisitReport).mockResolvedValue(1)
})

describe('prepared working day', () => {
  it('downloads only open assigned visits for one date and omits customer/operational metadata', async () => {
    vi.mocked(listMyVisits).mockResolvedValue([
      visit,
      { ...visit, id: 'complete', status: 'completed' },
    ])
    const snapshot = await prepareWorkerDay('company', 'worker', date)
    expect(listMyVisits).toHaveBeenCalledWith('company', date, date)
    expect(loadVisitReport).toHaveBeenCalledExactlyOnceWith('company', 'visit')
    expect(snapshot.scope).toBe('company:worker')
    expect(snapshot.visits).toHaveLength(1)
    expect(snapshot.visits[0]).toMatchObject({
      client_name: '',
      location_name: '',
      address: '',
      notes: '',
    })
    expect(snapshot.visits[0]).not.toHaveProperty('work_order_id')
    expect(snapshot.reports.get('visit')).toEqual({ revision: 0, data: null })
  })

  it('makes no report requests if the day exceeds the limit, and rejects partial preparation', async () => {
    vi.mocked(listMyVisits).mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({ ...visit, id: String(index) })),
    )
    await expect(prepareWorkerDay('company', 'worker', date)).rejects.toThrow(/20 visitas/)
    expect(loadVisitReport).not.toHaveBeenCalled()
    vi.mocked(listMyVisits).mockResolvedValue([visit, { ...visit, id: 'second' }])
    vi.mocked(loadVisitReport)
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('Connection gone'))
    await expect(prepareWorkerDay('company', 'worker', date)).rejects.toThrow('Connection gone')
  })
})

describe('manual report outbox transfer', () => {
  it('stops before reading or writing report data if access was revoked', async () => {
    vi.mocked(listMyVisits).mockResolvedValue([])
    await expect(sendQueuedVisitReport(command)).rejects.toThrow(/no está abierta o asignada/)
    expect(loadVisitReportReceipt).not.toHaveBeenCalled()
    expect(saveVisitReport).not.toHaveBeenCalled()
  })

  it('does not write if the tab changed company/visit during preflight', async () => {
    const stillActive = vi.fn().mockReturnValueOnce(true).mockReturnValue(false)
    await expect(sendQueuedVisitReport({ ...command, stillActive })).rejects.toThrow(
      /La jornada ha cambiado/,
    )
    expect(saveVisitReport).not.toHaveBeenCalled()
  })

  it('reports an honest conflict and does not call save if a new revision exists without the exact receipt', async () => {
    const remote = {
      data: command.draft.data,
      tenant_id: 'company',
      visit_id: 'visit',
      revision: 1,
      updated_by: 'other',
      updated_at: date,
    }
    vi.mocked(loadVisitReport).mockResolvedValue(remote)
    expect(await sendQueuedVisitReport(command)).toEqual({
      state: 'conflict',
      serverReport: remote,
    })
    expect(saveVisitReport).not.toHaveBeenCalled()
  })

  it('uses the same ID on retry and recognizes only a receipt for that actor, operation, revision and payload', async () => {
    vi.mocked(saveVisitReport).mockRejectedValue(new Error('Response lost'))
    vi.mocked(loadVisitReportReceipt).mockResolvedValueOnce(null).mockResolvedValueOnce({
      expected_revision: 0,
      revision: 1,
      data: command.draft.data,
    })
    expect(await sendQueuedVisitReport(command)).toEqual({
      state: 'received',
      revision: 1,
      serverReport: null,
    })
    expect(loadVisitReportReceipt).toHaveBeenLastCalledWith({
      tenantId: 'company',
      userId: 'worker',
      visitId: 'visit',
      operationId: 'operation-1',
    })
    expect(saveVisitReport).toHaveBeenCalledExactlyOnceWith({
      tenantId: 'company',
      visitId: 'visit',
      operationId: 'operation-1',
      expectedRevision: 0,
      data: command.draft.data,
    })
    vi.mocked(loadVisitReportReceipt).mockResolvedValue({
      expected_revision: 0,
      revision: 1,
      data: { ...command.draft.data, notes: 'Different' },
    })
    await expect(sendQueuedVisitReport(command)).rejects.toThrow(/El acuse no corresponde/)
    expect(saveVisitReport).toHaveBeenCalledTimes(1)
  })
})
