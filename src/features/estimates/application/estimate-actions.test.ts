import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TenantData } from '@/shared/domain/types'

const state = vi.hoisted(() => ({ data: null as TenantData | null }))
vi.mock('@/shared/store/store', () => ({
  newId: () => crypto.randomUUID(),
  updateTenantData: (update: (data: TenantData) => TenantData) => {
    if (state.data) state.data = update(state.data)
  },
}))

import { createEstimate, duplicateEstimate } from './estimate-actions'

beforeEach(() => {
  state.data = {
    tenant: {
      id: 'tenant',
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
    invoices: [],
    ledger: [],
  }
})

describe('estimate formats', () => {
  it('preserves the traditional format for existing callers', () => {
    createEstimate('client', 'Oferta sencilla')
    expect(state.data?.estimates[0]).toMatchObject({
      documentFormat: 'table',
      sections: [],
      title: 'Oferta sencilla',
    })
  })

  it('creates the chosen modular format with editable description and prices', () => {
    createEstimate('client', 'Propuesta completa', 'sections')
    const estimate = state.data?.estimates[0]
    expect(estimate?.documentFormat).toBe('sections')
    expect(estimate?.sections?.map((section) => section.type)).toEqual([
      'description',
      'work_table',
      'prices',
    ])
    expect(estimate?.clauses).toBe('')
  })

  it('preserves the format and remaps references when duplicating a proposal', () => {
    const id = createEstimate('client', 'Propuesta completa', 'sections')
    const original = state.data?.estimates[0]
    if (!original) throw new Error('Missing estimate')
    const lineId = crypto.randomUUID()
    original.lines.push({
      id: lineId,
      catalogItemId: null,
      description: 'Servicio',
      kind: 'labor',
      unit: 'ud',
      quantity: 1,
      unitPriceCents: 10_000,
      discountPercent: 0,
    })
    const priceSection = original.sections?.find((section) => section.type === 'prices')
    if (priceSection?.type === 'prices') priceSection.lineIds.push(lineId)
    const copyId = duplicateEstimate(id)
    const copy = state.data?.estimates.find((estimate) => estimate.id === copyId)
    expect(copy?.documentFormat).toBe('sections')
    expect(copy?.lines[0]?.id).not.toBe(lineId)
    expect(copy?.sections?.find((section) => section.type === 'prices')).toMatchObject({
      lineIds: [copy?.lines[0]?.id],
    })
    expect(copy?.sections?.[0]?.id).not.toBe(original.sections?.[0]?.id)
    expect(original.lines[0]?.id).toBe(lineId)
  })
})
