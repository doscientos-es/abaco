import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listClientVisitHistory, uploadSignedDocument } from './paper-visit-repository'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  upload: vi.fn(),
  storageFrom: vi.fn(),
  upsert: vi.fn(),
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ from: mocks.from, storage: { from: mocks.storageFrom } }),
}))

describe('paper visit persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const query = {
      select: mocks.select,
      eq: mocks.eq,
      order: mocks.order,
      range: mocks.range,
      upsert: mocks.upsert,
    }
    mocks.from.mockReturnValue(query)
    mocks.select.mockReturnValue(query)
    mocks.eq.mockReturnValue(query)
    mocks.order.mockReturnValue(query)
    mocks.storageFrom.mockReturnValue({ upload: mocks.upload })
    mocks.range.mockResolvedValue({ data: [], error: null })
    mocks.upsert.mockResolvedValue({ error: null })
    mocks.upload.mockResolvedValue({ error: null })
  })

  it('scopes client history to the company and center, with stable pagination', async () => {
    await listClientVisitHistory('tenant-1', 'client-1', 'center-1', 2)
    expect(mocks.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(mocks.eq).toHaveBeenCalledWith('client_id', 'client-1')
    expect(mocks.eq).toHaveBeenCalledWith('location_id', 'center-1')
    expect(mocks.range).toHaveBeenCalledWith(50, 74)
    expect(mocks.order).toHaveBeenCalledWith('id')
  })

  it('does not present a database read failure as an empty history', async () => {
    mocks.range.mockResolvedValue({ data: null, error: { message: 'Sin conexión' } })
    await expect(listClientVisitHistory('tenant-1', 'client-1', null, 0)).rejects.toThrow(
      'Sin conexión',
    )
  })

  it.each(['object', 'array'] as const)(
    'preserves original paper data with %s joins',
    async (shape) => {
      const location = {
        name: 'Centro actualizado',
        address: 'Dirección actual',
        timezone: 'Europe/Madrid',
      }
      const team = { name: 'Móvil A' }
      mocks.range.mockResolvedValue({
        data: [
          {
            id: 'visit-1',
            paper_snapshot: {
              client: 'Cliente original',
              center: 'Centro original',
              address: 'Dirección original',
            },
            location: shape === 'array' ? [location] : location,
            work_teams: shape === 'array' ? [team] : team,
          },
        ],
        error: null,
      })
      expect(await listClientVisitHistory('tenant-1', 'client-1', null, 0)).toEqual([
        expect.objectContaining({
          client_name: 'Cliente original',
          location_name: 'Centro original',
          address: 'Dirección original',
          timezone: 'Europe/Madrid',
          work_team_name: 'Móvil A',
        }),
      ])
    },
  )

  it('retries document registration after an immutable file was already uploaded', async () => {
    mocks.upload.mockResolvedValue({ error: { statusCode: '409', message: 'Already exists' } })
    const file = new File(['demo'], 'signed.pdf', { type: 'application/pdf' })
    await uploadSignedDocument('tenant-1', 'visit-1', file, 'operation-1')
    expect(mocks.upload).toHaveBeenCalledWith('tenant-1/visit-1/operation-1', file, {
      upsert: false,
      contentType: 'application/pdf',
    })
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ object_path: 'tenant-1/visit-1/operation-1', name: 'signed.pdf' }),
      { onConflict: 'id', ignoreDuplicates: true },
    )
  })

  it('rejects unsafe file formats before using storage', async () => {
    await expect(
      uploadSignedDocument(
        'tenant-1',
        'visit-1',
        new File(['demo'], 'script.html', { type: 'text/html' }),
        'operation-1',
      ),
    ).rejects.toThrow('Usa PDF')
    expect(mocks.upload).not.toHaveBeenCalled()
  })
})
