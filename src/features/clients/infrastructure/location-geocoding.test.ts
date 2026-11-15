import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  googleMapsSearchUrl,
  locationAddressQuery,
  searchLocationAddress,
} from './location-geocoding'

afterEach(() => vi.unstubAllGlobals())

describe('address lookup', () => {
  it('builds a safely encoded maps link from the current address', () => {
    const query = locationAddressQuery({
      address: ' Calle A & B ',
      postal_code: '52001',
      city: 'Melilla',
    })
    const url = new URL(googleMapsSearchUrl(query))
    expect(url.hostname).toBe('www.google.com')
    expect(url.searchParams.get('query')).toBe('Calle A & B, 52001, Melilla')
  })

  it('queries Photon and returns only valid labelled coordinates', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [-2.9381, 35.2923] },
            properties: { street: 'Calle A', housenumber: '1', city: 'Melilla' },
          },
          { geometry: { coordinates: [0, 0.0000001] }, properties: { name: 'Ecuador' } },
          { geometry: { coordinates: [999, 35] }, properties: { name: 'No válido' } },
          { geometry: null, properties: {} },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetch)
    await expect(searchLocationAddress('Calle A 1, Melilla')).resolves.toEqual([
      { label: 'Calle A 1, Melilla', coordinates: '35.2923, -2.9381' },
      { label: 'Ecuador', coordinates: '0.0000001, 0' },
    ])
    const url = fetch.mock.calls[0]?.[0] as URL
    expect(url.origin).toBe('https://photon.komoot.io')
    expect(url.searchParams.get('q')).toBe('Calle A 1, Melilla')
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit' })
  })

  it('reports unavailable and malformed responses instead of silently accepting them', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) }),
    )
    await expect(searchLocationAddress('Calle A')).rejects.toThrow()
    await expect(searchLocationAddress('Calle A')).rejects.toThrow()
  })
})
