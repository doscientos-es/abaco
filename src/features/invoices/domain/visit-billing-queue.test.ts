import { describe, expect, it } from 'vitest'

import { indexVisitReportGates, visitBillingQueueCategory } from './visit-billing-queue'

describe('cola de visitas por facturar', () => {
  it('utiliza solo la revisión de la última versión, aun si llegaron desordenadas', () => {
    const result = indexVisitReportGates(
      [
        { id: 'a1', visit_id: 'a', version: 1 },
        { id: 'b2', visit_id: 'b', version: 2 },
        { id: 'a2', visit_id: 'a', version: 2 },
        { id: 'b1', visit_id: 'b', version: 1 },
      ],
      new Set(['a1', 'b2']),
    )
    expect([...result]).toEqual([
      ['a', 'unreviewed'],
      ['b', 'reviewed'],
    ])
    expect(result.has('not-closed')).toBe(false)
  })
  it('prioriza el parte pendiente, decide después y trata el importe como comprobación manual', () => {
    expect(visitBillingQueueCategory({ status: 'pending', reportGate: 'missing' })).toBe('evidence')
    expect(visitBillingQueueCategory({ status: 'bill_separately', reportGate: 'unreviewed' })).toBe(
      'evidence',
    )
    expect(visitBillingQueueCategory({ status: 'pending', reportGate: 'reviewed' })).toBe(
      'decision',
    )
    expect(visitBillingQueueCategory({ status: 'bill_separately', reportGate: 'reviewed' })).toBe(
      'amount',
    )
  })
})
