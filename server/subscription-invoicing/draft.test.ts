import { describe, expect, it } from 'vitest'

import { prepareSubscriptionInvoiceDraft } from './draft'

const issuer = {
  legal_name: 'Doscientos Test SL',
  tax_id: 'B12345678',
  street: 'Calle Prueba 1',
  postal_code: '08001',
  city: 'Barcelona',
  province: 'Barcelona',
  series: 'AB',
}
const payment = {
  paymentId: '10000000-0000-4000-8000-000000000001',
  tenantId: '10000000-0000-4000-8000-000000000002',
  order: '1234ABCD',
  paidAt: '2026-11-22T12:00:00Z',
  startsAt: '2026-11-22T12:00:00Z',
  endsAt: '2026-12-22T12:00:00Z',
  plan: 'solo',
  interval: 'month',
  netCents: 3480,
  totalCents: 4211,
  vatPercent: 21,
  recipient: {
    ...issuer,
    legal_name: 'Empresa Test SL',
    tax_id: 'B87654321',
    email: 'test@example.test',
  },
}
const now = new Date('2026-11-22T12:01:00Z')

describe('preparation of a subscription invoice draft', () => {
  it('captures the issuer, billed recipient, paid period and exact tax breakdown without issuing', () => {
    const input = { ...payment, recipient: { ...payment.recipient } }
    const draft = prepareSubscriptionInvoiceDraft(input, issuer, now)
    expect(draft).toMatchObject({
      paymentId: payment.paymentId,
      tenantId: payment.tenantId,
      issuer: { legal_name: issuer.legal_name, series: 'AB' },
      recipient: { legal_name: payment.recipient.legal_name, tax_id: payment.recipient.tax_id },
      netCents: 3480,
      vatCents: 731,
      totalCents: 4211,
    })
    expect(draft).not.toHaveProperty('invoiceNumber')
    expect(draft).not.toHaveProperty('issuedAt')
    input.recipient.legal_name = 'Otra empresa'
    expect(draft.recipient.legal_name).toBe('Empresa Test SL')
  })

  it('rounds VAT in cents in the same way as the current payment contract', () => {
    const draft = prepareSubscriptionInvoiceDraft(
      { ...payment, netCents: 50, totalCents: 61 },
      issuer,
      now,
    )
    expect(draft.vatCents).toBe(11)
  })

  it.each([
    { totalCents: 4210 },
    { vatPercent: 10 },
    { netCents: 0 },
    { netCents: 3480.5 },
    { startsAt: '2026-12-22T12:00:00Z', endsAt: '2026-12-22T12:00:00Z' },
    { paidAt: '2026-11-23T12:00:00Z' },
    { paidAt: 'not-a-date' },
    { paymentId: 'not-a-uuid' },
    { order: 'anything' },
    { recipient: { ...payment.recipient, tax_id: '' } },
    { recipient: { ...payment.recipient, street: '  ' } },
  ])('rejects an inconsistent or incomplete captured payment', (patch) => {
    expect(() => prepareSubscriptionInvoiceDraft({ ...payment, ...patch }, issuer, now)).toThrow()
  })

  it.each([
    { ...issuer, series: '' },
    { ...issuer, series: '../AB' },
    { ...issuer, tax_id: '' },
    { ...issuer, postal_code: 'invalid' },
  ])('does not prepare a draft without valid issuer details', (candidate) => {
    expect(() => prepareSubscriptionInvoiceDraft(payment, candidate, now)).toThrow()
  })

  it('does not accept an invalid clock', () => {
    expect(() => prepareSubscriptionInvoiceDraft(payment, issuer, new Date('invalid'))).toThrow()
  })
})
