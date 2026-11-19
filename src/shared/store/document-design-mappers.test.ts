import { describe, expect, it } from 'vitest'

import { invoiceFromRow, tenantFromRow, tenantToRow } from './supabase-mappers'

describe('document design persistence', () => {
  it.each(['classic', 'modern', 'minimal', 'artistic'] as const)(
    'round-trips the %s tenant default',
    (design) => {
      const tenant = tenantFromRow({
        id: 'example',
        name: 'Empresa',
        default_invoice_design: design,
      })
      expect(tenant.defaultInvoiceDesign).toBe(design)
      expect(tenantToRow(tenant).default_invoice_design).toBe(design)
    },
  )

  it('ignores unknown tenant defaults', () => {
    expect(
      tenantFromRow({ default_invoice_design: 'unknown' }).defaultInvoiceDesign,
    ).toBeUndefined()
  })

  it('reads the captured invoice style instead of a live tenant setting', () => {
    const invoice = invoiceFromRow({
      document_snapshot: {
        source: 'issuance',
        capturedAt: '2026-01-01',
        design: 'artistic',
        issuer: { name: 'Empresa' },
        client: { name: 'Cliente' },
      },
    })
    expect(invoice.snapshot?.design).toBe('artistic')
    expect(
      invoiceFromRow({ document_snapshot: { issuer: {}, client: {} } }).snapshot?.design,
    ).toBeUndefined()
  })
})
