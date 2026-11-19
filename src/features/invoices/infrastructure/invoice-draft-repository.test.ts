import { beforeEach, describe, expect, it, vi } from 'vitest'

import { issueInvoiceDraft, listOpenInvoiceDrafts } from './invoice-draft-repository'

const fetch = vi.hoisted(() => vi.fn<typeof globalThis.fetch>())
vi.mock('@/shared/lib/supabase/client', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient('https://synthetic.example.test', 'synthetic-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  })
  return { createBrowserSupabaseClient: () => client }
})

const row = {
  id: 'draft-1',
  tenantId: 'tenant-1',
  originId: 'origin-1',
  concept: 'Mantenimiento',
  totalCents: 12345,
  dueDate: '2026-12-01',
  revision: 2,
}

function getRequest() {
  const call = fetch.mock.calls[0]
  if (!call) throw new Error('Expected a Supabase request')
  return new Request(...call)
}

describe('invoice draft repository', () => {
  beforeEach(() => fetch.mockReset())

  it.each([
    ['milestone', 'estimate_id'],
    ['work_extra', 'work_order_id'],
    ['contract_period', 'contract_id'],
  ] as const)('pages %s drafts and normalizes their origin', async (source, originColumn) => {
    fetch.mockResolvedValueOnce(Response.json(Array.from({ length: 21 }, () => row)))

    const result = await listOpenInvoiceDrafts(source, row.tenantId, 1)

    const url = new URL(getRequest().url)
    expect(url.pathname).toBe(`/rest/v1/invoice_${source}_drafts`)
    expect(url.searchParams.get('select')?.split(',')).toContain(`originId:${originColumn}`)
    expect(url.searchParams.get('tenant_id')).toBe(`eq.${row.tenantId}`)
    expect(url.searchParams.get('status')).toBe('eq.draft')
    expect(url.searchParams.get('order')).toBe('created_at.desc,id.desc')
    expect(url.searchParams.get('offset')).toBe('20')
    expect(url.searchParams.get('limit')).toBe('21')
    expect(result).toEqual({
      items: Array.from({ length: 20 }, () => ({ ...row, source })),
      hasMore: true,
    })
  })

  it.each([null, 'template-1'])(
    'passes the selected template (%s) and operation to issuance',
    async (templateId) => {
      fetch.mockResolvedValueOnce(Response.json('invoice-1'))

      await expect(
        issueInvoiceDraft({
          source: 'contract_period',
          tenantId: row.tenantId,
          draftId: row.id,
          revision: row.revision,
          operationId: 'operation-1',
          templateId,
        }),
      ).resolves.toBe('invoice-1')

      const request = getRequest()
      expect(new URL(request.url).pathname).toBe('/rest/v1/rpc/issue_invoice_draft_with_template')
      expect(request.method).toBe('POST')
      expect(await request.json()).toEqual({
        p_source: 'contract_period',
        p_tenant_id: row.tenantId,
        p_draft_id: row.id,
        p_expected_revision: row.revision,
        p_operation_id: 'operation-1',
        p_template_id: templateId,
      })
    },
  )
})
