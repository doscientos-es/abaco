import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import {
  applyPriceChanges,
  createMaterials,
  duplicateMaterials,
  loadCatalog,
  parseMaterialPrice,
  planPriceChanges,
} from './catalog-batch'

const raw = (id: string, price = 100) => ({
  id,
  tenant_id: 'tenant',
  name: `Material ${id}`,
  sku: id,
  kind: 'material',
  category: 'Obra',
  unit: 'ud',
  unit_price_cents: price,
  updated_at: '2026-01-01T00:00:00Z',
})
function database(responses: unknown[]) {
  const calls: { url: URL; method: string; body: unknown }[] = []
  const client = createClient('https://db.example.invalid', 'synthetic-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: vi.fn(async (input, init) => {
        calls.push({
          url: new URL(String(input)),
          method: init?.method ?? 'GET',
          body: init?.body ? JSON.parse(String(init.body)) : null,
        })
        return new Response(JSON.stringify(responses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    },
  })
  return { client, calls }
}

describe('catalogue batch proposals', () => {
  it('rejects missing, malformed and excessive prices rather than treating them as zero', () => {
    expect(parseMaterialPrice('0')).toBe(0)
    expect(parseMaterialPrice('12,50')).toBe(1250)
    for (const value of ['', '-2', '1.234,56', '9'.repeat(400), '1000000000'])
      expect(parseMaterialPrice(value)).toBeNull()
  })
  it('loads every page scoped to the tenant and detects duplicates', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => raw(String(i).padStart(4, '0')))
    const db = database([rows, [raw('0200')]])
    const items = await loadCatalog(db.client, 'tenant')
    expect(items).toHaveLength(201)
    expect(db.calls[1]?.url.searchParams.get('id')).toBe('gt.0199')
    expect(db.calls.every((call) => call.url.searchParams.get('tenant_id') === 'eq.tenant')).toBe(
      true,
    )
    const material = { name: 'Nuevo', sku: '0200', category: null, unit: null, unitPriceCents: 100 }
    expect(duplicateMaterials([material], items)).toEqual(['Nuevo'])
    expect(
      duplicateMaterials(
        [
          { ...material, sku: null },
          { ...material, sku: null },
        ],
        [],
      ),
    ).toEqual(['Nuevo'])
  })

  it('calculates percentage prices with rounding, scope and limits', async () => {
    const db = database([[raw('a', 125), { ...raw('b', 100), kind: 'labor' }]])
    const items = await loadCatalog(db.client, 'tenant')
    expect(
      planPriceChanges(items, { basisPoints: 200, kind: 'material', category: 'obra' }).map(
        (c) => c.newPrice,
      ),
    ).toEqual([128])
    expect(
      planPriceChanges(items, { basisPoints: -10000, kind: 'all', category: null }).map(
        (c) => c.newPrice,
      ),
    ).toEqual([0, 0])
    const first = items[0]
    if (!first) throw new Error('Expected a catalog item')
    expect(() =>
      planPriceChanges([{ ...first, unitPriceCents: 99999999999 }], {
        basisPoints: 200,
        kind: 'all',
        category: null,
      }),
    ).toThrow('máximo')
  })

  it('uses one insert for the whole material batch', async () => {
    const db = database([null])
    await createMaterials(db.client, 'tenant', [
      { name: 'A', sku: null, category: null, unit: null, unitPriceCents: 100 },
    ])
    expect(db.calls).toHaveLength(1)
    expect(db.calls[0]?.body).toMatchObject([
      { tenant_id: 'tenant', kind: 'material', unit_price_cents: 100 },
    ])
  })

  it('stops at a stale row and reports the confirmed partial result', async () => {
    const db = database([[raw('a'), raw('b'), raw('c')], [{ id: 'a' }], []])
    const changes = planPriceChanges(await loadCatalog(db.client, 'tenant'), {
      basisPoints: 200,
      kind: 'all',
      category: null,
    })
    expect(await applyPriceChanges(db.client, 'tenant', changes)).toEqual({
      applied: 1,
      complete: false,
      uncertain: false,
      failed: 'Material b',
    })
    expect(db.calls).toHaveLength(3)
    expect(db.calls[1]?.url.searchParams.get('updated_at')).toBe('eq.2026-01-01T00:00:00Z')
    expect(db.calls[1]?.body).toEqual({ unit_price_cents: 102 })
  })

  it('stops on a denied write without treating it as a successful batch', async () => {
    const read = database([[raw('a'), raw('b')]])
    const changes = planPriceChanges(await loadCatalog(read.client, 'tenant'), {
      basisPoints: 200,
      kind: 'all',
      category: null,
    })
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'denied' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const db = createClient('https://db.example.invalid', 'synthetic-key', {
      global: { fetch: fetcher },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    expect(await applyPriceChanges(db, 'tenant', changes)).toEqual({
      applied: 0,
      complete: false,
      uncertain: true,
      failed: 'Material a',
    })
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
