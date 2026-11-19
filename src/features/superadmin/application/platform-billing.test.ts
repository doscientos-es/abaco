import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { platformPageSize } from '../domain/platform-navigation'
import { platformInvoiceQuery, type PlatformInvoice } from './platform-billing'

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

  it('returns the exact bank order even when search yields other invoices first', async () => {
    const broadMatches = Array.from({ length: platformPageSize + 1 }, (_, index) => ({
      ...invoice,
      merchant_order: `0123${String(index).padStart(4, '0')}`,
      company_name: `Empresa ${reference}`,
    }))
    rpc.mockImplementation((_fn, { p_offset }) => ({
      abortSignal: async () => ({ data: p_offset === 0 ? broadMatches : [invoice], error: null }),
    }))

    await expect(lookup()).resolves.toEqual(invoice)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenLastCalledWith('superadmin_subscription_invoices', {
      p_search: reference,
      p_offset: platformPageSize,
      p_filter: null,
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
