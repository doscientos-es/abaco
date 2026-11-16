import { describe, expect, it } from 'vitest'

import { supplierOrderMailto } from './supplier-order'

describe('supplierOrderMailto', () => {
  const order = {
    email: 'compras@example.com',
    supplierName: 'Proveedor & Cía.',
    companyName: 'Empresa',
    estimateNumber: 'P-2026-001',
    lines: [{ name: 'Tubo', sku: 'A&B', unit: 'm', missingQuantity: 2.5 }],
  }

  it('prepares a safely encoded email containing the missing quantity and reference', () => {
    const url = supplierOrderMailto(order)
    expect(url).toMatch(/^mailto:compras%40example\.com\?/)
    const query = new URLSearchParams(url?.split('?')[1])
    expect(query.get('subject')).toContain('P-2026-001')
    expect(query.get('body')).toContain('Tubo (ref. A&B): 2,5 m')
    expect(query.get('body')).toContain('Proveedor & Cía.')
  })

  it('does not create an email link without a valid recipient or material', () => {
    expect(supplierOrderMailto({ ...order, email: 'invalid?bcc=other@example.com' })).toBeNull()
    expect(supplierOrderMailto({ ...order, email: '' })).toBeNull()
    expect(supplierOrderMailto({ ...order, lines: [] })).toBeNull()
  })
})
