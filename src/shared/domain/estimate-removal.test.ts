import { describe, expect, it } from 'vitest'

import { estimateRemovalError } from './estimate-removal'
import type { Estimate, Invoice } from './types'

const estimate: Estimate = {
  id: 'estimate',
  tenantId: 'tenant',
  number: 'P-1',
  clientId: 'client',
  title: 'Servicio',
  status: 'draft',
  lines: [],
  milestones: [{ id: 'milestone', label: 'Señal', percent: 100 }],
  discountType: 'none',
  discountValue: 0,
  vatRate: 21,
  clauses: '',
  validUntil: '2026-12-01',
  createdAt: '2026-11-01',
}
const invoice: Invoice = {
  id: 'invoice',
  tenantId: 'tenant',
  number: 'F-1',
  clientId: 'client',
  estimateId: 'estimate',
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
}

describe('estimate removal protection', () => {
  it('rejects removing an invoiced milestone without removing its estimate', () => {
    expect(estimateRemovalError(estimate, { ...estimate, milestones: [] }, [invoice])).toContain(
      'hito con facturas emitidas',
    )
  })

  it.each(['issued', 'sent', 'paid'] as const)('protects the source of a %s invoice', (status) => {
    expect(estimateRemovalError(estimate, undefined, [{ ...invoice, status }])).toContain(
      'presupuesto con facturas emitidas',
    )
  })

  it('permits editing without removing the billed milestone and removing unbilled milestones', () => {
    const before = {
      ...estimate,
      milestones: [...estimate.milestones, { id: 'unbilled', label: 'Final', percent: 0 }],
    }
    expect(
      estimateRemovalError(before, { ...estimate, title: 'Actualizado' }, [invoice]),
    ).toBeNull()
  })

  it('permits deletion without invoices, ignoring invoices from other estimates and tenants', () => {
    expect(estimateRemovalError(estimate, undefined, [])).toBeNull()
    expect(
      estimateRemovalError(estimate, undefined, [
        { ...invoice, estimateId: 'other' },
        { ...invoice, tenantId: 'other' },
      ]),
    ).toBeNull()
  })
})
