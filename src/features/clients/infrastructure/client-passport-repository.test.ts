import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadClientPassport } from './client-passport-repository'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  queries: new Map<string, { eq: ReturnType<typeof vi.fn> }>(),
  fail: '',
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ from: mocks.from }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fail = ''
  mocks.queries.clear()
  mocks.from.mockImplementation((table: string) => {
    if (!['client_contacts', 'service_locations'].includes(table))
      throw new Error('Legacy table queried')
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockImplementation(() =>
        Promise.resolve({
          data:
            table === 'service_locations'
              ? [{ id: 'centre-1', name: 'Office', active: true }]
              : [{ id: 'contact-1', name: 'Reception' }],
          error: mocks.fail === table ? { message: 'Sin conexión' } : null,
        }),
      ),
    }
    mocks.queries.set(table, query)
    return query
  })
})

describe('client contacts and centres', () => {
  it('loads populated centres without querying legacy assets, pools or equipment', async () => {
    await expect(loadClientPassport('tenant-1', 'client-1')).resolves.toEqual({
      contacts: [{ id: 'contact-1', name: 'Reception' }],
      locations: [{ id: 'centre-1', name: 'Office', active: true }],
    })
    expect(mocks.from.mock.calls).toEqual([['client_contacts'], ['service_locations']])
    for (const query of mocks.queries.values()) {
      expect(query.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1')
      expect(query.eq).toHaveBeenCalledWith('client_id', 'client-1')
    }
  })

  it.each(['client_contacts', 'service_locations'])(
    'does not hide errors loading %s',
    async (table) => {
      mocks.fail = table
      await expect(loadClientPassport('tenant-1', 'client-1')).rejects.toThrow('Sin conexión')
    },
  )
})
