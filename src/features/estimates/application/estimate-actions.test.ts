import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TenantData } from '@/shared/domain/types'

const state = vi.hoisted(() => ({ data: null as TenantData | null }))
vi.mock('@/shared/store/store', () => ({
  newId: () => crypto.randomUUID(),
  updateTenantData: (update: (data: TenantData) => TenantData) => {
    if (state.data) state.data = update(state.data)
  },
}))

import {
  createEstimate,
  deleteEstimate,
  duplicateEstimate,
  patchEstimate,
} from './estimate-actions'

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
  it('creates a document with required sections by default', () => {
    createEstimate('client', 'Oferta sencilla')
    expect(state.data?.estimates[0]).toMatchObject({
      documentFormat: 'sections',
      title: 'Oferta sencilla',
    })
    expect(state.data?.estimates[0]?.sections?.map((section) => section.type)).toEqual([
      'description',
      'work_table',
      'prices',
    ])
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

it('removes only the selected draft and preserves published estimates', () => {
  const draftId = createEstimate('client', 'Borrador')
  const sentId = createEstimate('client', 'Publicado')
  const sent = state.data?.estimates.find((estimate) => estimate.id === sentId)
  if (!sent) throw new Error('Missing estimate')
  sent.status = 'sent'

  deleteEstimate(sentId)
  expect(state.data?.estimates).toHaveLength(2)
  deleteEstimate(draftId)
  expect(state.data?.estimates.map((estimate) => estimate.id)).toEqual([sentId])
})

it('rejects deleting an invoiced draft or its milestone without changing local state', () => {
  const estimateId = createEstimate('client', 'Borrador histórico')
  const before = state.data
  const estimate = before?.estimates[0]
  if (!before || !estimate) throw new Error('Missing estimate')
  estimate.milestones = [{ id: 'milestone', label: 'Señal', percent: 100 }]
  before.invoices.push({
    id: 'invoice',
    tenantId: 'tenant',
    number: 'F-1',
    clientId: 'client',
    estimateId,
    milestoneId: 'milestone',
    workExtraId: null,
    concept: 'Señal',
    totalCents: 12100,
    paidCents: 0,
    vatRate: 21,
    status: 'issued',
    documentStatus: 'issued',
    emailAcceptedAt: null,
    issuedAt: '2026-11-01',
    dueDate: '2026-12-01',
  })

  expect(() => deleteEstimate(estimateId)).toThrow('presupuesto con facturas emitidas')
  expect(state.data).toBe(before)
  expect(() => patchEstimate(estimateId, { milestones: [] })).toThrow('hito con facturas emitidas')
  expect(state.data).toBe(before)
  expect(state.data?.estimates[0]?.milestones).toHaveLength(1)
  patchEstimate(estimateId, { title: 'Corregido' })
  expect(state.data?.estimates[0]?.title).toBe('Corregido')
})
