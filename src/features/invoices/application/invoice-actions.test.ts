import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hydrateStore, setRepository } from '@/shared/store/store'

import { registerInvoicePayment } from './invoice-actions'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ rpc }),
}))

describe('invoice payment command', () => {
  beforeEach(async () => {
    rpc.mockReset()
    setRepository({
      load: async () => ({
        activeTenantId: 'tenant-1',
        tenants: {
          'tenant-1': {
            tenant: {
              id: 'tenant-1',
              name: 'Empresa',
              taxId: '',
              email: '',
              phone: '',
              defaultVatRate: 21,
              defaultDepositPercent: 30,
              nextEstimateNumber: 1,
            },
            clients: [],
            catalog: [],
            estimates: [],
            ledger: [],
            invoices: [],
          },
        },
      }),
      save: async () => undefined,
    })
    await hydrateStore()
  })

  it('reuses the operation id when a network failure is retried', async () => {
    rpc
      .mockResolvedValueOnce({ error: { message: 'timeout' } })
      .mockResolvedValueOnce({ error: null })

    expect(await registerInvoicePayment('invoice-1', 2500, 'transfer', '2026-10-21')).toEqual({
      ok: false,
      error: 'timeout',
    })
    expect(await registerInvoicePayment('invoice-1', 2500, 'transfer', '2026-10-21')).toEqual({
      ok: true,
    })

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[0]?.[1].p_operation_id).toBe(rpc.mock.calls[1]?.[1].p_operation_id)
  })
})
