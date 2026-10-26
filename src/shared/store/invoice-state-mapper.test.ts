import { describe, expect, it } from 'vitest'

import { invoiceFromRow, invoiceToRow } from './supabase-mappers'

const issuedRow = {
  id: 'invoice-1',
  tenant_id: 'tenant-1',
  number: 'F-2026-001',
  client_id: 'client-1',
  concept: 'Servicio',
  total_cents: 12100,
  paid_cents: 0,
  vat_rate: 21,
  status: 'issued',
  issued_at: '2026-10-25',
  due_date: '2026-11-10',
}

describe('invoice state projection', () => {
  it('keeps issuance separate from email acceptance', () => {
    const invoice = invoiceFromRow({
      ...issuedRow,
      email_accepted_at: '2026-10-25T12:00:00Z',
    })
    expect(invoice.status).toBe('sent')
    expect(invoice.documentStatus).toBe('issued')
    expect(invoice.emailAcceptedAt).toBe('2026-10-25T12:00:00Z')
    expect(invoiceToRow(invoice).status).toBe('issued')
  })

  it('derives settlement from the balance while retaining delivery evidence', () => {
    const invoice = invoiceFromRow({
      ...issuedRow,
      paid_cents: 12100,
      email_accepted_at: '2026-10-25T12:00:00Z',
    })
    expect(invoice.status).toBe('paid')
    expect(invoice.documentStatus).toBe('issued')
    expect(invoice.emailAcceptedAt).toBe('2026-10-25T12:00:00Z')
  })

  it('does not treat a zero-value legacy document as collected', () => {
    expect(invoiceFromRow({ ...issuedRow, total_cents: 0 }).status).toBe('issued')
  })
})
