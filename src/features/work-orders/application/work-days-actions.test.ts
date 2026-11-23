import { beforeEach, describe, expect, it, vi } from 'vitest'

import { saveWorkDays } from './work-days-actions'
import type { WorkOrder } from './work-order-actions'

const mocks = vi.hoisted(() => ({ create: vi.fn(), transition: vi.fn() }))
vi.mock('@/features/visits/application/visit-actions', () => ({
  createServiceVisit: mocks.create,
  transitionServiceVisit: mocks.transition,
}))

const input = {
  tenantId: 'tenant',
  order: { id: 'work', client_id: 'client', location_id: null, title: 'Instalación' } as WorkOrder,
  visits: [
    {
      id: 'old',
      scheduled_start_at: '2026-11-01T08:00:00Z',
      status: 'scheduled' as const,
      updated_at: 'v1',
      service_locations: null,
    },
  ],
  selectedDays: ['2026-11-03', '2026-11-05'],
  localTime: '09:00',
  timezone: 'Europe/Madrid',
  durationMinutes: 120,
  assignedUserId: 'worker',
}

describe('saveWorkDays', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.create.mockResolvedValue('new')
    mocks.transition.mockResolvedValue(undefined)
  })

  it('creates separate visits for the same work and cancels a removed day with its version', async () => {
    await saveWorkDays(input, new Map())
    expect(mocks.create).toHaveBeenCalledTimes(2)
    expect(mocks.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workOrderId: 'work',
        localStart: '2026-11-03T09:00',
        assignedUserId: 'worker',
        durationMinutes: 120,
      }),
    )
    expect(mocks.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ workOrderId: 'work', localStart: '2026-11-05T09:00' }),
    )
    expect(mocks.transition).toHaveBeenCalledWith(
      expect.objectContaining({ visitId: 'old', expectedUpdatedAt: 'v1', nextStatus: 'canceled' }),
    )
  })

  it('reuses the operation id when a visit creation has an uncertain result', async () => {
    const operations = new Map<string, string>()
    mocks.create.mockRejectedValueOnce(new Error('offline'))
    await expect(saveWorkDays(input, operations)).rejects.toThrow('offline')
    const first = mocks.create.mock.calls[0]?.[0].operationId
    await saveWorkDays(input, operations)
    expect(mocks.create.mock.calls[1]?.[0].operationId).toBe(first)
    expect(operations.size).toBe(0)
  })

  it('does not cancel existing days when creating a new day fails', async () => {
    mocks.create.mockRejectedValueOnce(new Error('conflicto'))
    await expect(saveWorkDays(input, new Map())).rejects.toThrow('conflicto')
    expect(mocks.transition).not.toHaveBeenCalled()
  })

  it('rejects removing a completed visit before making any changes', async () => {
    await expect(
      saveWorkDays(
        { ...input, visits: input.visits.map((visit) => ({ ...visit, status: 'completed' })) },
        new Map(),
      ),
    ).rejects.toThrow('No se pueden quitar días')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.transition).not.toHaveBeenCalled()
  })
})
