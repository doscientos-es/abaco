import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { searchRecords } from './search-records'

function database(responses: unknown[]) {
  const urls: URL[] = []
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    urls.push(
      new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url),
    )
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return {
    urls,
    client: createClient('https://db.example.invalid', 'synthetic-key', {
      global: { fetch: fetcher },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  }
}

describe('AI database search', () => {
  it('scopes client searches, escapes filter syntax and reports truncated results', async () => {
    const db = database([
      Array.from({ length: 11 }, (_, id) => ({
        id: String(id),
        name: 'Cliente',
        notes: 'x'.repeat(600),
      })),
    ])
    const result = await searchRecords(db.client, 'tenant-a', {
      type: 'clientes',
      query: 'A",status.eq.draft',
    })
    expect(db.urls[0]?.searchParams.get('tenant_id')).toBe('eq.tenant-a')
    expect(db.urls[0]?.searchParams.get('archived_at')).toBe('is.null')
    expect(db.urls[0]?.searchParams.get('or')).toContain('A\\",status.eq.draft')
    expect(result.matches).toHaveLength(10)
    expect(result.truncated).toBe(true)
    expect(result.matches[0]).toMatchObject({ notes: 'x'.repeat(500), notesTruncated: true })
  })

  it('scopes inventory queries and distinguishes zero stock from uncontrolled stock', async () => {
    const db = database([
      [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      [{ catalog_item_id: 'a', quantity: 0 }],
    ])
    const result = await searchRecords(db.client, 'tenant-a', { type: 'inventario', query: '' })
    expect(db.urls.map((url) => url.searchParams.get('tenant_id'))).toEqual([
      'eq.tenant-a',
      'eq.tenant-a',
    ])
    expect(result.matches).toMatchObject([
      { id: 'a', stock: 0 },
      { id: 'b', stock: null },
    ])
  })

  it('filters estimates and calculates totals only when every line is available', async () => {
    const line = {
      id: 'line',
      estimate_id: 'e',
      kind: 'material',
      quantity: 2,
      unit_price_cents: 1000,
      discount_percent: 0,
    }
    const base = {
      id: 'e',
      number: 'P-1',
      title: 'Obra',
      vat_rate: 21,
      discount_type: 'none',
      document_format: 'table',
      document_sections: [],
    }
    const db = database([
      [
        { ...base, estimate_lines: [line] },
        { ...base, id: 'long', estimate_lines: Array(6).fill(line) },
      ],
    ])
    const result = await searchRecords(db.client, 'tenant-a', {
      type: 'presupuestos',
      query: '',
      clientId: '00000000-0000-4000-8000-000000000001',
      status: 'draft',
    })
    expect(db.urls[0]?.searchParams.get('client_id')).toBe(
      'eq.00000000-0000-4000-8000-000000000001',
    )
    expect(db.urls[0]?.searchParams.get('status')).toBe('eq.draft')
    expect(result.matches).toMatchObject([
      { totalCents: 2420, moreLines: false },
      { totalCents: null, moreLines: true },
    ])
  })

  it('calculates a specific estimate from all its lines while limiting the output', async () => {
    const line = {
      id: 'line',
      estimate_id: 'e',
      kind: 'material',
      quantity: 1,
      unit_price_cents: 1000,
      discount_percent: 0,
    }
    const db = database([
      [
        {
          id: 'e',
          number: 'P-1',
          title: 'Obra',
          vat_rate: 21,
          discount_type: 'none',
          document_format: 'table',
          document_sections: [],
          estimate_lines: Array(6).fill(line),
        },
      ],
    ])
    const result = await searchRecords(db.client, 'tenant-a', {
      type: 'presupuestos',
      query: '',
      recordId: '00000000-0000-4000-8000-000000000001',
    })
    expect(db.urls[0]?.searchParams.get('id')).toBe('eq.00000000-0000-4000-8000-000000000001')
    expect(db.urls[0]?.searchParams.get('estimate_lines.limit')).toBe('501')
    expect(result.matches[0]).toMatchObject({
      totalCents: 7260,
      moreLines: true,
      estimate_lines: Array(5).fill(expect.any(Object)),
    })
  })

  it('does not turn a database failure into an empty result', async () => {
    const db = createClient('https://db.example.invalid', 'synthetic-key', {
      global: { fetch: async () => new Response('{}', { status: 500 }) },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    await expect(searchRecords(db, 'tenant-a', { type: 'clientes', query: '' })).rejects.toThrow(
      'No se pudieron consultar',
    )
  })
})
