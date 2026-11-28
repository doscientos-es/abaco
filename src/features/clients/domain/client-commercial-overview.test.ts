import { describe, expect, it } from 'vitest'

import type { Estimate, Invoice } from '@/shared/domain/types'

import { selectClientCommercialOverview } from './client-commercial-overview'

const estimate: Estimate = {
  id: 'sent',
  tenantId: 'tenant',
  clientId: 'client',
  title: 'Visita',
  number: 'P-1',
  createdAt: '2026-11-25',
  validUntil: '2026-11-29',
  status: 'sent',
  lines: [],
  vatRate: 21,
  discountType: 'none',
  discountValue: 0,
  milestones: [],
  clauses: '',
}
const invoice: Invoice = {
  id: 'pending',
  tenantId: 'tenant',
  clientId: 'client',
  concept: 'Visita',
  number: 'F-1',
  estimateId: null,
  milestoneId: null,
  workExtraId: null,
  documentStatus: 'issued',
  emailAcceptedAt: null,
  totalCents: 10000,
  paidCents: 2500,
  vatRate: 21,
  status: 'issued',
  issuedAt: '2026-11-20',
  dueDate: '2026-11-29',
}

describe('resumen comercial del cliente', () => {
  it('mantiene solo los documentos de la empresa y el cliente y muestra saldo tras abonos', () => {
    const result = selectClientCommercialOverview(
      'tenant',
      'client',
      [
        estimate,
        { ...estimate, id: 'draft', status: 'draft' },
        { ...estimate, id: 'other-client', clientId: 'unrelated' },
        { ...estimate, id: 'other-tenant', tenantId: 'unrelated' },
      ],
      [
        invoice,
        { ...invoice, id: 'paid', status: 'paid', paidCents: 10000 },
        { ...invoice, id: 'other-client', clientId: 'unrelated' },
        { ...invoice, id: 'other-tenant', tenantId: 'unrelated' },
      ],
    )
    expect(result).toEqual({ sent: [estimate], outstanding: [invoice], outstandingCents: 7500 })
  })
})
