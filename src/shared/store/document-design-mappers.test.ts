import { describe, expect, it } from 'vitest'

import { invoiceFromRow, tenantFromRow, tenantToRow } from './supabase-mappers'

describe('document design persistence', () => {
  it('round-trips tenant defaults and ignores unknown invoice styles', () => {
    const tenant = tenantFromRow({
      id: 'example',
      name: 'Empresa',
      default_invoice_design: 'modern',
    })
    expect(tenant.defaultInvoiceDesign).toBe('modern')
    expect(tenantToRow(tenant).default_invoice_design).toBe('modern')
    expect(
      tenantFromRow({ default_invoice_design: 'unknown' }).defaultInvoiceDesign,
    ).toBeUndefined()
  })

  it('reads the captured invoice style instead of a live tenant setting', () => {
    const invoice = invoiceFromRow({
      document_snapshot: {
        source: 'issuance',
        capturedAt: '2026-01-01',
        design: 'minimal',
        issuer: { name: 'Empresa' },
        client: { name: 'Cliente' },
      },
    })
    expect(invoice.snapshot?.design).toBe('minimal')
    expect(
      invoiceFromRow({ document_snapshot: { issuer: {}, client: {} } }).snapshot?.design,
    ).toBeUndefined()
  })
})
