import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listServiceContracts, transitionServiceContract } from './contract-repository'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  neq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}))

describe('contract activity persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const query = {
      select: mocks.select,
      eq: mocks.eq,
      neq: mocks.neq,
      order: mocks.order,
      range: mocks.range,
    }
    for (const method of [mocks.from, mocks.select, mocks.eq, mocks.neq, mocks.order]) {
      method.mockReturnValue(query)
    }
    mocks.range.mockResolvedValue({ data: [{ id: 'contract-1' }], count: 21, error: null })
  })

  it('keeps the default list unfiltered and scopes pagination and count to the tenant', async () => {
    expect(await listServiceContracts('tenant-1', 1)).toEqual({
      items: [{ id: 'contract-1' }],
      count: 21,
      pageSize: 20,
    })
    expect(mocks.from).toHaveBeenCalledWith('service_contracts')
    expect(mocks.select).toHaveBeenCalledWith(expect.any(String), { count: 'exact' })
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith('tenant_id', 'tenant-1')
    expect(mocks.neq).not.toHaveBeenCalled()
    expect(mocks.range).toHaveBeenCalledWith(20, 39)
  })

  it('filters active contracts on the server before paginating', async () => {
    await listServiceContracts('tenant-1', 0, 'active')
    expect(mocks.eq).toHaveBeenCalledWith('status', 'active')
    expect(mocks.neq).not.toHaveBeenCalled()
    expect(mocks.eq.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.range.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('includes every non-active lifecycle state in the inactive filter', async () => {
    await listServiceContracts('tenant-1', 0, 'inactive')
    expect(mocks.neq).toHaveBeenCalledWith('status', 'active')
    expect(mocks.neq.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.range.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('propagates list errors instead of presenting an empty result', async () => {
    mocks.range.mockResolvedValue({ data: null, count: null, error: { message: 'Sin conexión' } })
    await expect(listServiceContracts('tenant-1', 0, 'active')).rejects.toThrow('Sin conexión')
  })

  it('preserves version, operation identity and audit reason when deactivating', async () => {
    const input = {
      tenantId: 'tenant-1',
      contractId: 'contract-1',
      expectedUpdatedAt: 'version-1',
      nextStatus: 'paused' as const,
      reason: '  Fin de temporada  ',
      operationId: 'operation-1',
    }
    mocks.rpc.mockResolvedValue({ error: null })
    await transitionServiceContract(input)
    expect(mocks.rpc).toHaveBeenCalledWith('transition_service_contract', {
      p_tenant_id: 'tenant-1',
      p_contract_id: 'contract-1',
      p_expected_updated_at: 'version-1',
      p_next_status: 'paused',
      p_reason: 'Fin de temporada',
      p_operation_id: 'operation-1',
    })
    mocks.rpc.mockResolvedValue({ error: { message: 'Recarga la ficha' } })
    await expect(transitionServiceContract(input)).rejects.toThrow('Recarga la ficha')
  })
})
