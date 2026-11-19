import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  moveTableColumn,
  readColumnPreferences,
  resolveColumnPreferences,
  writeColumnPreferences,
} from './table-column-preferences'

const columns = [
  { id: 'name', label: 'Nombre', required: true },
  { id: 'stock', label: 'Stock', available: false },
  { id: 'price', label: 'Precio' },
  { id: 'status', label: 'Estado' },
] as const

afterEach(() => vi.unstubAllGlobals())

describe('table column preferences', () => {
  it('recovers from stale or malformed preferences and keeps required and new columns', () => {
    expect(
      resolveColumnPreferences(columns, {
        order: ['price', 'removed', 'price', 1, 'name'],
        hidden: ['name', 'stock', 'removed', 'stock'],
      }),
    ).toEqual({ order: ['price', 'name', 'stock', 'status'], hidden: ['stock'] })
    expect(resolveColumnPreferences(columns, { order: null, hidden: 'price' })).toEqual({
      order: ['name', 'stock', 'price', 'status'],
      hidden: [],
    })
  })

  it('reorders available columns while preserving temporarily unavailable columns', () => {
    const initial = resolveColumnPreferences(columns, { hidden: ['stock'] })
    const moved = moveTableColumn(initial, 'name', 1, ['name', 'price', 'status'])
    expect(moved).toEqual({ order: ['price', 'stock', 'name', 'status'], hidden: ['stock'] })
    expect(moveTableColumn(moved, 'price', -1, ['name', 'price', 'status'])).toEqual(moved)
  })

  it('round-trips separate table settings and tolerates disabled or corrupted storage', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    })
    const saved = { order: ['price', 'name', 'stock', 'status'], hidden: ['status'] }
    writeColumnPreferences('estimates', saved)
    expect(readColumnPreferences('estimates', columns)).toEqual(saved)
    expect(readColumnPreferences('clients', columns).hidden).toEqual([])
    values.set('estimates', '{invalid')
    expect(readColumnPreferences('estimates', columns).hidden).toEqual([])
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('blocked')
      },
    })
    expect(() => writeColumnPreferences('estimates', saved)).not.toThrow()
    expect(readColumnPreferences('estimates', columns).order).toEqual([
      'name',
      'stock',
      'price',
      'status',
    ])
  })
})
