import { beforeEach, describe, expect, it, vi } from 'vitest'

import { proposeVisitShift, type BatchVisitProposal } from '../domain/batch-visit-replan'
import {
  applyVisitBatch,
  canRetryBatchVisit,
  prepareVisitBatch,
  type BatchVisitResult,
} from './batch-visit-replan-actions'
import type { VisitSummary } from './visit-actions'

const mocks = vi.hoisted(() => ({
  replan: vi.fn(),
  visits: vi.fn(),
  teams: vi.fn(),
  absences: vi.fn(),
}))
vi.mock('./visit-actions', () => ({
  listPlanningVisits: mocks.visits,
}))
vi.mock('@/features/work-teams/application/work-team-actions', () => ({
  workTeamActions: { list: mocks.teams },
}))
vi.mock('../infrastructure/batch-visit-replan-repository', () => ({
  loadBatchBlockingAbsences: mocks.absences,
  writeBatchVisitReplan: mocks.replan,
}))

function makeVisit(id: string, start: string, end: string): VisitSummary {
  return {
    id,
    title: id,
    client_name: '',
    location_name: '',
    address: '',
    timezone: 'UTC',
    work_team_id: null,
    assigned_user_id: 'worker',
    scheduled_start_at: `2026-11-27T${start}:00Z`,
    scheduled_end_at: `2026-11-27T${end}:00Z`,
    updated_at: `version-${id}`,
    status: 'scheduled',
    priority: 'normal',
    notes: '',
  }
}

const a = makeVisit('A', '08:00', '09:00')
const b = makeVisit('B', '09:00', '10:00')
const c = { ...makeVisit('C', '08:00', '09:00'), assigned_user_id: null }
const proposal: BatchVisitProposal = {
  slots: [
    { ...proposeVisitShift(a, 60), dependsOn: ['B'] },
    proposeVisitShift(b, 60),
    proposeVisitShift(c, 60),
  ],
  sequence: ['B', 'A', 'C'],
}

async function run(operations = new Map<string, string>(), previous: BatchVisitResult[] = []) {
  const results = [...previous]
  await applyVisitBatch({
    tenantId: 'tenant',
    proposal,
    operations,
    previous,
    onResult: (result) => {
      const index = results.findIndex(({ id }) => id === result.id)
      if (index < 0) results.push(result)
      else results[index] = result
    },
  })
  return { results, operations }
}

describe('explicit, non-atomic batch writes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.replan.mockResolvedValue(undefined)
    mocks.visits.mockResolvedValue([a, b, c])
    mocks.teams.mockResolvedValue([])
    mocks.absences.mockResolvedValue([])
  })

  it('prepares using fresh, scoped availability and never sends a mutation', async () => {
    const draft = await prepareVisitBatch('tenant', [a, b], 60)
    expect(draft.sequence).toEqual(['B', 'A'])
    expect(mocks.visits).toHaveBeenCalledWith('tenant', '2026-11-25', '2026-11-29', null)
    expect(mocks.teams).toHaveBeenCalledWith('tenant')
    expect(mocks.absences).toHaveBeenCalledWith('tenant', '2026-11-25', '2026-11-29')
    expect(mocks.replan).not.toHaveBeenCalled()
    mocks.visits.mockRejectedValue(new Error('Agenda unavailable'))
    await expect(prepareVisitBatch('tenant', [a, b], 60)).rejects.toThrow('Agenda unavailable')
    expect(mocks.replan).not.toHaveBeenCalled()
  })

  it('keeps successful rows, retries uncertain writes with the same UUID, and defers dependencies', async () => {
    mocks.replan.mockRejectedValueOnce(new Error('Respuesta perdida'))
    const { results, operations } = await run()
    expect(results.map(({ id, status }) => [id, status])).toEqual([
      ['B', 'unconfirmed'],
      ['A', 'blocked'],
      ['C', 'applied'],
    ])
    expect(
      results.every(
        (result) => result.status === 'applied' || canRetryBatchVisit(result, results, proposal),
      ),
    ).toBe(true)
    expect(mocks.replan.mock.calls.map(([input]) => input.visitId)).toEqual(['B', 'C'])
    expect(mocks.replan.mock.calls[0]?.[0]).toMatchObject({
      tenantId: 'tenant',
      expectedUpdatedAt: 'version-B',
      startAt: '2026-11-27T10:00:00.000Z',
      endAt: '2026-11-27T11:00:00.000Z',
    })
    const retried = await run(operations, results)
    expect(mocks.replan.mock.calls.map(([input]) => input.visitId)).toEqual(['B', 'C', 'B', 'A'])
    expect(mocks.replan.mock.calls[0]?.[0]).toEqual(mocks.replan.mock.calls[2]?.[0])
    expect(retried.results.every(({ status }) => status === 'applied')).toBe(true)
  })

  it('does not retry a server rejection or a dependent proposal that requires rechecking', async () => {
    mocks.replan.mockRejectedValueOnce(
      Object.assign(new Error('La visita cambió'), { code: 'P0409' }),
    )
    const { results, operations } = await run()
    expect(results.map(({ status }) => status)).toEqual(['rejected', 'blocked', 'applied'])
    expect(results.some((result) => canRetryBatchVisit(result, results, proposal))).toBe(false)
    await run(operations, results)
    expect(mocks.replan.mock.calls.map(([input]) => input.visitId)).toEqual(['B', 'C'])
  })
})
