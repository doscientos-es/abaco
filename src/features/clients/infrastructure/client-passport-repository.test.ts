import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createLocation, loadClientPassport, updateLocation } from './client-passport-repository'

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

  it('persists opening hours when creating a centre', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'centre-1' }, error: null })
    const insert = vi.fn().mockReturnValue({ select: () => ({ single }) })
    mocks.from.mockReturnValue({ insert })

    await createLocation({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      name: 'Office',
      kind: 'service',
      address: 'Address',
      city: '',
      openingHours: '  Lunes a viernes, 8:00–18:00  ',
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ opening_hours: 'Lunes a viernes, 8:00–18:00' }),
    )
  })

  it('persists opening hours when updating a centre', async () => {
    const result = { data: [{ id: 'centre-1' }], error: null }
    const query = { eq: vi.fn().mockReturnThis(), select: vi.fn().mockResolvedValue(result) }
    const update = vi.fn().mockReturnValue(query)
    mocks.from.mockReturnValue({ update })
    const location = {
      id: 'centre-1',
      name: 'Office',
      kind: 'service' as const,
      address: 'Address',
      city: '',
      postal_code: '',
      opening_hours: 'Antes',
      operational_contact: '',
      access_notes: '',
      notes: '',
      active: true,
      updated_at: 'version-1',
    }

    await updateLocation('tenant-1', location, { ...location, opening_hours: '  Nuevo horario  ' })

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ opening_hours: 'Nuevo horario' }))
    expect(query.eq).toHaveBeenCalledWith('updated_at', 'version-1')
  })
})
