import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { loadAccountingExport } from './accounting-export-repository'

describe('accounting export repository', () => {
  it('continues past the first page and only exports expenses for the selected tenant', async () => {
    const clients = Array.from({ length: 501 }, (_, index) => ({
      id: `client-${String(index).padStart(4, '0')}`,
      tenant_id: 'tenant-1',
      name: `Cliente ${index}`,
    }))
    clients.push({ id: 'client-other', tenant_id: 'tenant-2', name: 'No autorizado' })
    const rows: Record<string, Array<Record<string, unknown> & { id: string }>> = {
      clients,
      invoices: [],
      invoice_payment_operations: [],
      ledger_entries: [
        { id: 'expense-1', tenant_id: 'tenant-1', kind: 'expense', amount_cents: 1210 },
        { id: 'income-1', tenant_id: 'tenant-1', kind: 'income', amount_cents: 5000 },
      ],
    }
    const from = vi.fn((table: string) => {
      let tenant = ''
      let kind = ''
      let after = ''
      let pageSize = 500
      const query = {
        select: () => query,
        eq: (column: string, value: string) => {
          if (column === 'tenant_id') tenant = value
          if (column === 'kind') kind = value
          return query
        },
        order: () => query,
        limit: (value: number) => {
          pageSize = value
          return query
        },
        gt: (_column: string, value: string) => {
          after = value
          return query
        },
        // eslint-disable-next-line unicorn/no-thenable -- Supabase query builders are thenables.
        then: (resolve: (value: unknown) => unknown) => {
          const data = (rows[table] ?? [])
            .filter((row) => row.tenant_id === tenant && (!kind || row.kind === kind))
            .filter((row) => !after || row.id > after)
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice(0, pageSize)
          return Promise.resolve({ data, error: null }).then(resolve)
        },
      }
      return query
    })

    const db = { from } as unknown as SupabaseClient
    const data = await loadAccountingExport('tenant-1', 'all', db)

    expect(data.clients).toHaveLength(501)
    expect(data.clients.at(-1)?.id).toBe('client-0500')
    expect(data.clients.some((client) => client.name === 'No autorizado')).toBe(false)
    expect(data.expenses.map((expense) => expense.id)).toEqual(['expense-1'])
    expect(from.mock.calls.filter(([table]) => table === 'clients')).toHaveLength(2)
    from.mockClear()
    const clientExport = await loadAccountingExport('tenant-1', 'clients', db)
    expect(clientExport.clients).toHaveLength(501)
    expect(from.mock.calls.every(([table]) => table === 'clients')).toBe(true)
  })
})
