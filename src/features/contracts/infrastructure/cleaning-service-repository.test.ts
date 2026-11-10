import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listCleaningServices } from './cleaning-service-repository'

const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn() }))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ from: mocks.from }),
}))

describe('cleaning service center data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const query = { select: mocks.select, eq: mocks.eq, order: mocks.order }
    mocks.from.mockReturnValue(query)
    mocks.select.mockReturnValue(query)
    mocks.eq.mockReturnValue(query)
  })

  it.each(['object', 'array'] as const)(
    'normalizes a joined center returned as an %s',
    async (shape) => {
      const center = {
        name: 'Portal DEMO',
        address: 'Dirección ficticia',
        operational_contact: 'Oficina',
        access_notes: 'Entrada lateral',
        notes: '',
      }
      mocks.order.mockResolvedValue({
        data: [{ id: 'service-1', location: shape === 'array' ? [center] : center }],
        error: null,
      })
      const services = await listCleaningServices('tenant-1', 'contract-1')
      expect(services[0]?.location).toEqual(center)
      expect(mocks.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1')
      expect(mocks.eq).toHaveBeenCalledWith('contract_id', 'contract-1')
    },
  )

  it('keeps a missing center null and propagates read errors', async () => {
    mocks.order.mockResolvedValueOnce({ data: [{ id: 'service-1', location: [] }], error: null })
    expect((await listCleaningServices('tenant-1', 'contract-1'))[0]?.location).toBeNull()
    mocks.order.mockResolvedValueOnce({ data: null, error: { message: 'Sin conexión' } })
    await expect(listCleaningServices('tenant-1', 'contract-1')).rejects.toThrow('Sin conexión')
  })
})
