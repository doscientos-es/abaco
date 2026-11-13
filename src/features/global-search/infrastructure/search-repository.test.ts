import { beforeEach, describe, expect, it, vi } from 'vitest'

import { searchRemoteResources } from './search-repository'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ from: mocks.from }),
}))

function result(data: { id: string; title: string }[], error: object | null = null) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    ilike: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    abortSignal: vi.fn().mockResolvedValue({ data, error }),
  }
  for (const method of ['select', 'eq', 'ilike', 'order', 'limit'] as const)
    chain[method].mockReturnValue(chain)
  return chain
}

beforeEach(() => vi.clearAllMocks())

describe('remote search boundary', () => {
  it('scopes and bounds every query and returns real typed destinations', async () => {
    const contracts = result([{ id: 'c', title: 'Contrato' }])
    const work = result([{ id: 'w', title: 'Trabajo' }])
    mocks.from.mockImplementation((table: string) =>
      table === 'service_contracts' ? contracts : work,
    )
    const signal = new AbortController().signal
    const response = await searchRemoteResources('company', '20%_limpieza', signal)
    for (const chain of [contracts, work]) {
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'company')
      expect(chain.limit).toHaveBeenCalledWith(6)
      expect(chain.ilike).toHaveBeenCalledWith('title', '%20\\%\\_limpieza%')
      expect(chain.abortSignal).toHaveBeenCalledWith(signal)
      expect(chain.select).toHaveBeenCalledWith('id,title')
    }
    expect(response.failed).toBe(false)
    expect(response.items.map((item) => item.target)).toEqual([
      { to: '/contratos/$contractId', params: { contractId: 'c' } },
      { to: '/trabajos/$workOrderId', params: { workOrderId: 'w' } },
    ])
  })

  it('preserves successful results when another resource fails', async () => {
    const work = result([{ id: 'w', title: 'Trabajo' }])
    mocks.from.mockImplementation((table: string) =>
      table === 'service_contracts' ? result([], { message: 'Unavailable' }) : work,
    )
    const response = await searchRemoteResources('company', 'Trabajo', new AbortController().signal)
    expect(response.failed).toBe(true)
    expect(response.items.map((item) => item.id)).toEqual(['work:w'])
  })
})
