import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { Estimate, TenantData } from '../domain/types'
import type { AppState } from './store'
import { createSupabaseRepository } from './supabase-repository'

const estimate: Estimate = {
  id: 'estimate-1',
  tenantId: 'tenant-1',
  number: 'P-2026-001',
  clientId: 'client-1',
  title: 'Original',
  status: 'draft',
  lines: [],
  milestones: [],
  discountType: 'none',
  discountValue: 0,
  vatRate: 21,
  clauses: '',
  validUntil: '2026-11-20',
  createdAt: '2026-10-21',
}

const data: TenantData = {
  tenant: {
    id: 'tenant-1',
    name: 'Empresa',
    taxId: '',
    email: '',
    phone: '',
    defaultVatRate: 21,
    defaultDepositPercent: 30,
    nextEstimateNumber: 2,
  },
  clients: [],
  catalog: [],
  estimates: [estimate],
  ledger: [],
  invoices: [],
}

describe('Supabase repository', () => {
  it('updates an existing estimate without sending its server-assigned number', async () => {
    const update = vi.fn().mockReturnValue({
      eq: () => ({ select: async () => ({ data: [{ id: estimate.id }], error: null }) }),
    })
    const supabase = { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient
    const repository = createSupabaseRepository(supabase)
    const previous: AppState = { activeTenantId: 'tenant-1', tenants: { 'tenant-1': data } }
    const next: AppState = {
      ...previous,
      tenants: {
        'tenant-1': {
          ...data,
          estimates: [{ ...estimate, title: 'Corregido' }],
        },
      },
    }

    await repository.save(previous, next)

    expect(update).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ title: 'Corregido' }))
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty('number')
  })

  it('rejects physical client removal before writing other changes', async () => {
    const client = {
      id: 'client-1',
      tenantId: 'tenant-1',
      name: 'Cliente',
      taxId: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
    }
    const from = vi.fn()
    const repository = createSupabaseRepository({ from } as unknown as SupabaseClient)
    const previous: AppState = {
      activeTenantId: 'tenant-1',
      tenants: { 'tenant-1': { ...data, clients: [client] } },
    }
    const next: AppState = {
      ...previous,
      tenants: { 'tenant-1': { ...data, clients: [] } },
    }

    await expect(repository.save(previous, next)).rejects.toThrow('se archivan')
    expect(from).not.toHaveBeenCalled()
  })
})
