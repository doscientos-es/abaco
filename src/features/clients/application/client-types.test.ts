import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  response: { data: null as unknown, error: null as null | { code: string } },
  tenant: '',
  id: '',
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    from: () => {
      const query = {
        delete: () => query,
        eq: (key: string, value: string) => {
          if (key === 'tenant_id') mocks.tenant = value
          else mocks.id = value
          return query
        },
        select: () => query,
        maybeSingle: async () => mocks.response,
      }
      return query
    },
  }),
}))

import { deleteClientType } from './client-types'

beforeEach(() => {
  mocks.response = { data: null, error: null }
  mocks.tenant = ''
  mocks.id = ''
})

describe('deleting client types', () => {
  it('reports a foreign key conflict even if another session assigned the type', async () => {
    mocks.response = { data: null, error: { code: '23503' } }
    await expect(deleteClientType('tenant-a', 'type-a')).rejects.toThrow(
      'hay clientes que utilizan este tipo',
    )
    expect(mocks.tenant).toBe('tenant-a')
    expect(mocks.id).toBe('type-a')
  })

  it('does not report success when RLS or a concurrent delete hid the row', async () => {
    await expect(deleteClientType('tenant-a', 'type-a')).rejects.toThrow(
      'ya no existe o no tienes permiso',
    )
  })
})
