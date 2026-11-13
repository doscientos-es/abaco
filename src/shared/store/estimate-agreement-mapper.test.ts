import { describe, expect, it } from 'vitest'

import type { EstimateAgreement } from '../domain/estimate-agreement'
import type { EstimateSection } from '../domain/estimate-document'
import { estimateFromRow, estimateToRow, invoiceFromRow, lineToRow } from './supabase-mappers'

const id = (value: number) => `85000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const service = {
  id: id(3),
  task: 'Limpiar ventanas',
  frequency: 'Dos veces al año',
  notes: 'Acceso por recepción',
}
const services: EstimateSection = {
  id: id(2),
  type: 'work_table',
  title: 'Servicios',
  pageBreakBefore: false,
  rows: [service],
}
const agreement: EstimateAgreement = {
  version: 1,
  currency: 'EUR',
  estimateId: id(1),
  price: {
    billingFrequency: 'monthly',
    netCents: 17_878,
    vatRate: 21,
    vatCents: 3754,
    totalCents: 21_632,
  },
  services: [{ ...service, sectionId: id(2), sourceLineId: null }],
}
const snapshot = { source: 'issuance', issuer: {}, client: {}, estimateAgreement: agreement }

describe('structured estimate agreement persistence', () => {
  it('round-trips prices, billing periodicity and service details without parsing prose', () => {
    const price: EstimateSection = {
      id: id(4),
      type: 'prices',
      title: 'Precio',
      pageBreakBefore: false,
      lineIds: [id(5)],
    }
    const saved = estimateFromRow({
      id: id(1),
      document_format: 'sections',
      document_sections: [services, price],
      contract_billing_frequency: 'monthly',
      vat_rate: 21,
      discount_type: 'none',
      estimate_lines: [
        {
          id: id(5),
          estimate_id: id(1),
          description: 'Precio',
          kind: 'labor',
          unit: 'ud',
          quantity: 1,
          unit_price_cents: 17_878,
          discount_percent: 0,
        },
      ],
      estimate_milestones: [],
    })
    expect(estimateToRow(saved)).toMatchObject({
      contract_billing_frequency: 'monthly',
      document_sections: [services, price],
      vat_rate: 21,
    })
    const line = saved.lines[0]
    if (!line) throw new Error('Missing persisted price line')
    expect(lineToRow(saved, line, 0)).toMatchObject({
      id: id(5),
      quantity: 1,
      unit_price_cents: 17_878,
    })
    expect(saved.sections?.[0]).toEqual(services)
  })

  it('retains the original agreement separately from a partial invoice amount', () => {
    const invoice = invoiceFromRow({ total_cents: 10_816, document_snapshot: snapshot })
    expect(invoice.totalCents).toBe(10_816)
    expect(invoice.snapshot?.estimateAgreement).toEqual(agreement)
    expect(invoice.snapshot?.estimateAgreement?.services[0]?.frequency).toBe('Dos veces al año')
    expect(invoice.snapshot?.estimateAgreement?.price.billingFrequency).toBe('monthly')
  })

  it('does not invent metadata for historical invoices', () => {
    expect(
      invoiceFromRow({ document_snapshot: { issuer: {}, client: {} } }).snapshot,
    ).not.toHaveProperty('estimateAgreement')
  })

  it.each([
    { ...agreement, version: 2 },
    { ...agreement, price: { ...agreement.price, totalCents: 216.32 } },
    { ...agreement, price: { ...agreement.price, billingFrequency: 'weekly' } },
    { ...agreement, services: [{ ...agreement.services[0], id: 'invalid' }] },
  ])('rejects malformed metadata rather than silently dropping it', (estimateAgreement) => {
    expect(() =>
      invoiceFromRow({ document_snapshot: { ...snapshot, estimateAgreement } }),
    ).toThrow()
  })
})
