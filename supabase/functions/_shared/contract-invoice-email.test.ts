import { describe, expect, it } from 'vitest'

import { contractInvoiceEmail, type ContractInvoiceEmailPayload } from './contract-invoice-email'

export const invoicePayload: ContractInvoiceEmailPayload = {
  invoice: {
    number: 'F-2026-001',
    concept: 'Limpieza <mensual>',
    total_cents: 12100,
    vat_rate: 21,
    issued_at: '2026-11-13',
    due_date: '2026-11-13',
    document_snapshot: {
      issuer: {
        name: 'Empresa',
        legalName: 'Empresa SL',
        taxId: 'B12345678',
        iban: 'ES00 TEST',
        email: 'empresa@example.test',
      },
      client: {
        name: 'Ana <script>alert(1)</script>',
        email: ' ana@example.test ',
        taxId: '12345678Z',
      },
      contractTitle: 'Limpieza',
      contractPeriodStart: '2026-10-01',
      contractPeriodEnd: '2026-10-31',
    },
  },
  intro: 'Tu factura del mes.',
  signature: 'Gracias',
  from_name: 'Empresa',
}

describe('contract invoice email', () => {
  it('includes the immutable fiscal document, tax breakdown and bank details', () => {
    const email = contractInvoiceEmail(invoicePayload)
    expect(email.to).toBe('ana@example.test')
    expect(email.subject).toBe('Factura F-2026-001 · Empresa')
    for (const value of [
      'Empresa SL',
      'B12345678',
      '12345678Z',
      '2026-10-31',
      'ES00 TEST',
      '100,00',
      '21,00',
      '121,00',
      'Gracias',
    ]) {
      expect(email.text).toContain(value)
    }
  })

  it('escapes HTML in client data, concepts and email customizations', () => {
    const email = contractInvoiceEmail(invoicePayload)
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
    expect(email.html).toContain('Limpieza &lt;mensual&gt;')
  })

  it('rejects missing recipients and invalid amounts before dispatch', () => {
    const payload = structuredClone(invoicePayload)
    payload.invoice.document_snapshot.client.email = null
    expect(() => contractInvoiceEmail(payload)).toThrow('email_missing')
    payload.invoice.document_snapshot.client.email = 'ana@example.test'
    payload.invoice.total_cents = 0
    expect(() => contractInvoiceEmail(payload)).toThrow('invoice_invalid')
  })
})
