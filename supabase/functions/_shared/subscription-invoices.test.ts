import { describe, expect, it } from 'vitest'

import { handoffResult } from './subscription-invoices'

describe('subscription invoice handoff', () => {
  it('keeps the invoice link when the response includes a number and HTTPS link', () => {
    expect(
      handoffResult({
        status: 'sent',
        invoiceNumber: 'TEST-001',
        portalUrl: 'https://example.test/invoice',
      }),
    ).toEqual({
      status: 'sent',
      number: 'TEST-001',
      url: 'https://example.test/invoice',
    })
  })

  it.each([
    { status: 'sent', invoiceNumber: 'TEST-001' },
    {
      status: 'email_pending',
      invoiceNumber: 'TEST-001',
      portalUrl: 'http://example.test/invoice',
    },
    { status: 'email_review', invoiceNumber: '', portalUrl: 'https://example.test/invoice' },
    { status: 'unknown' },
  ])('retries when the response cannot be recorded ($status)', (reply) => {
    expect(handoffResult(reply)).toEqual({ status: 'retrying', number: null, url: null })
  })

  it('keeps a fiscal review state without requiring an invoice link', () => {
    expect(handoffResult({ status: 'fiscal_review' })).toEqual({
      status: 'fiscal_review',
      number: null,
      url: null,
    })
  })
})
