import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  findIssuedVisitInvoice,
  listVisitBillingReviews,
  setVisitInvoiceCoverage,
} from './visit-billing-review-repository'

const fixture = vi.hoisted(() => ({ fetch: vi.fn<typeof fetch>() }))

vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () =>
    createClient('https://local.test', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fixture.fetch },
    }),
}))

describe('visit billing coverage data adapter', () => {
  const invoice = {
    id: 'invoice-1',
    number: 'F-2026-001',
    concept: 'Visit report',
    total_cents: 10000,
    issued_at: '2026-11-01',
  }
  const urls: URL[] = []

  beforeEach(() => {
    urls.length = 0
    fixture.fetch.mockReset()
    fixture.fetch.mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : input)
      urls.push(url)
      switch (url.pathname.split('/').at(-1)) {
        case 'service_visit_billing_reviews':
          return Response.json(
            url.searchParams.get('coverage_invoice_id') === 'not.is.null'
              ? [
                  {
                    visit_id: 'v-01',
                    client_id: 'client-a',
                    source_kind: 'standalone',
                    status: 'bill_separately',
                    created_at: '2026-11-18',
                    coverage_invoice_id: invoice.id,
                  },
                ]
              : [],
          )
        case 'invoices':
          return Response.json([invoice])
        case 'set_service_visit_invoice_coverage':
          return Response.json(null)
        default:
          return Response.json([])
      }
    })
  })

  it('filters by positively linked invoice before querying a deterministically ordered page', async () => {
    expect(await listVisitBillingReviews('tenant-a', 1)).toEqual({ reviews: [], hasNext: false })
    expect(Object.fromEntries(urls[0]?.searchParams ?? [])).toMatchObject({
      coverage_invoice_id: 'is.null',
      tenant_id: 'eq.tenant-a',
      limit: '51',
      offset: '50',
      order: 'created_at.desc,visit_id.desc',
    })
    expect(urls).toHaveLength(1)

    const linked = await listVisitBillingReviews('tenant-a', 0, 'linked')
    expect(urls[1]?.searchParams.get('coverage_invoice_id')).toBe('not.is.null')
    expect(linked.reviews[0]).toMatchObject({
      coverageInvoiceId: 'invoice-1',
      coverageInvoiceNumber: 'F-2026-001',
      reportGate: 'missing',
    })
  })

  it('looks up only issued positive invoices by exact number and same client and tenant', async () => {
    await expect(findIssuedVisitInvoice('tenant-a', 'client-a', ' f-2026-001 ')).resolves.toEqual(
      invoice,
    )
    expect(Object.fromEntries(urls[0]?.searchParams ?? [])).toMatchObject({
      tenant_id: 'eq.tenant-a',
      client_id: 'eq.client-a',
      number: 'eq.F-2026-001',
      status: 'eq.issued',
      total_cents: 'gt.0',
    })
  })

  it('writes only to the coverage RPC and explicitly records the selected confirmation', async () => {
    await setVisitInvoiceCoverage({
      tenantId: 'tenant-a',
      visitId: 'v-01',
      invoiceId: invoice.id,
      action: 'attach',
      confirmFullCoverage: true,
      reason: 'Confirma todos los trabajos',
      operationId: 'operation-a',
    })
    expect(urls.map((url) => url.pathname)).toEqual([
      '/rest/v1/rpc/set_service_visit_invoice_coverage',
    ])
    const request = fixture.fetch.mock.calls[0]?.[1]
    expect(request?.method).toBe('POST')
    const body = request?.body
    if (typeof body !== 'string') throw new Error('Expected a JSON body')
    expect(JSON.parse(body)).toEqual({
      p_action: 'attach',
      p_confirm_full_coverage: true,
      p_invoice_id: 'invoice-1',
      p_operation_id: 'operation-a',
      p_reason: 'Confirma todos los trabajos',
      p_tenant_id: 'tenant-a',
      p_visit_id: 'v-01',
    })
  })
})
