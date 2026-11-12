import { describe, expect, it, vi } from 'vitest'

import { fetchAllPages } from './fetch-all-pages'

describe('fetchAllPages', () => {
  it('loads every page, including the final empty page for exact multiples', async () => {
    const fetchPage = vi.fn(async (from: number) => ({
      data: from === 0 ? Array.from({ length: 500 }, (_, id) => ({ id })) : [],
      error: null,
    }))
    const rows = await fetchAllPages<{ id: number }>(fetchPage)
    expect(rows).toHaveLength(500)
    expect(rows[499]).toEqual({ id: 499 })
    expect(fetchPage.mock.calls).toEqual([
      [0, 499],
      [500, 999],
    ])
  })

  it('fails instead of returning partial results when a later page fails', async () => {
    const fetchPage = vi.fn(async (from: number) =>
      from === 0
        ? { data: Array.from({ length: 500 }, () => 1), error: null }
        : { data: null, error: { message: 'denied' } },
    )
    await expect(fetchAllPages(fetchPage, 'No se pudo cargar.')).rejects.toThrow(
      'No se pudo cargar.',
    )
    await expect(fetchAllPages(fetchPage)).rejects.toThrow('denied')
  })
})
