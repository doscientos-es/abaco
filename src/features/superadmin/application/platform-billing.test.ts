import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  platformInvoiceQuery,
  platformInvoicesQuery,
  type PlatformInvoice,
} from './platform-billing'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/shared/lib/supabase/client', () => ({ createBrowserSupabaseClient: () => ({ rpc }) }))

const reference = '0427AbCd'
const invoice: PlatformInvoice = {
  id: 'payment',
  tenant_id: 'company',
  company_name: 'Empresa de prueba',
  invoice_number: 'TEST-2030-01',
  invoice_status: 'sent',
  invoice_portal_url: null,
  merchant_order: reference,
  amount_cents: 3400,
  paid_at: '2030-07-15T12:00:00Z',
}

const lookup = () => new QueryClient().fetchQuery(platformInvoiceQuery('admin', reference))

describe('platform invoice lookup', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('looks up the exact order with one server query pinned to the company', async () => {
    rpc.mockReturnValue({ abortSignal: async () => ({ data: [invoice], error: null }) })
    await expect(
      new QueryClient().fetchQuery(platformInvoiceQuery('admin', reference, 'company')),
    ).resolves.toEqual(invoice)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('superadmin_subscription_invoice_directory', {
      p_search: '',
      p_offset: 0,
      p_filter: null,
      p_tenant: 'company',
      p_reference: reference,
    })
  })

  it('preserves the company scope, page, search and invoice status in list requests', async () => {
    rpc.mockReturnValue({ abortSignal: async () => ({ data: [invoice], error: null }) })
    await expect(
      new QueryClient().fetchQuery(platformInvoicesQuery('admin', 'TEST', 2, 'issued', 'company')),
    ).resolves.toMatchObject({ rows: [invoice] })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('superadmin_subscription_invoice_directory', {
      p_search: 'TEST',
      p_offset: 50,
      p_filter: 'issued',
      p_tenant: 'company',
      p_reference: null,
    })
  })

  it('does not return a similar order when the exact invoice is unavailable', async () => {
    rpc.mockReturnValue({
      abortSignal: async () => ({
        data: [{ ...invoice, merchant_order: reference.toLowerCase() }],
        error: null,
      }),
    })
    await expect(lookup()).resolves.toBeNull()
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
