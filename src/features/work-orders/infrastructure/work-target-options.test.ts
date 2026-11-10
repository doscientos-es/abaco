import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadWorkTargetOptions } from './work-order-repository'

const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn() }))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ from: mocks.from }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  const query = { select: mocks.select, eq: mocks.eq, order: mocks.order }
  mocks.from.mockReturnValue(query)
  mocks.select.mockReturnValue(query)
  mocks.eq.mockReturnValue(query)
})

describe('work centre options', () => {
  it('loads active centres for the client without an assets query', async () => {
    const locations = [
      { id: 'centre', name: 'Office', address: 'Test street', timezone: 'Europe/Madrid' },
    ]
    mocks.order.mockResolvedValue({ data: locations, error: null })
    await expect(loadWorkTargetOptions('tenant', 'client')).resolves.toEqual({ locations })
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith('service_locations')
    expect(mocks.eq.mock.calls).toEqual([
      ['tenant_id', 'tenant'],
      ['client_id', 'client'],
      ['active', true],
    ])
  })

  it('returns an empty centre list without inventing a target', async () => {
    mocks.order.mockResolvedValue({ data: null, error: null })
    await expect(loadWorkTargetOptions('tenant', 'client')).resolves.toEqual({ locations: [] })
  })

  it('propagates centre lookup failures', async () => {
    mocks.order.mockResolvedValue({ data: null, error: { message: 'Sin conexión' } })
    await expect(loadWorkTargetOptions('tenant', 'client')).rejects.toThrow('Sin conexión')
  })
})
