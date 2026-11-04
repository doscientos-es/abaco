import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { loadPaymentCalendar } from './payment-calendar-repository'

describe('payment calendar repository', () => {
  it('reads all pages for the requested tenant instead of silently truncating forecasts', async () => {
    const rows = Array.from({ length: 501 }, (_, index) => ({
      id: `payment-${String(index).padStart(4, '0')}`,
      tenant_id: 'tenant-a',
    }))
    rows.push({ id: 'payment-other', tenant_id: 'tenant-b' })
    const from = vi.fn((table: string) => {
      let tenant = ''
      let cursor = ''
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          tenant = value
          return query
        },
        order: () => query,
        limit: () => query,
        gt: (_column: string, value: string) => {
          cursor = value
          return query
        },
        // eslint-disable-next-line unicorn/no-thenable -- Supabase query builders are thenables.
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data:
              table === 'invoices'
                ? []
                : rows.filter((row) => row.tenant_id === tenant && row.id > cursor).slice(0, 500),
            error: null,
          }).then(resolve),
      }
      return query
    })
    const result = await loadPaymentCalendar('tenant-a', { from } as unknown as SupabaseClient)
    expect(result.payments).toHaveLength(501)
    expect(result.payments.at(-1)?.id).toBe('payment-0500')
    expect(from.mock.calls.filter(([table]) => table === 'scheduled_payments')).toHaveLength(2)
  })
})
