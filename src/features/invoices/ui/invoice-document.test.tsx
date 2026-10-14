import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { formatEuros } from '@/shared/domain/money'
import type { Client, Invoice, Tenant } from '@/shared/domain/types'
import { DocumentPreview } from '@/shared/ui/document-preview'

import { InvoiceDocument } from './invoice-document'

const tenant: Tenant = {
  id: 'test-tenant', name: 'Reformas Ejemplo', legalName: 'Reformas Ejemplo SL',
  taxId: 'B00000000', email: 'empresa@example.test', phone: '600000000',
  address: 'Calle Ejemplo, 10', postalCode: '08001', city: 'Barcelona',
  website: 'example.test', iban: 'ES00 0000 0000 0000 0000 0000',
  brandColor: '#8354c8', logoUrl: 'https://example.test/logo.png',
  documentFooter: 'Condiciones legales de la empresa.\nGracias por tu confianza.',
  defaultVatRate: 21, defaultDepositPercent: 30, nextEstimateNumber: 1,
}
const client: Client = {
  id: 'test-client', tenantId: tenant.id, name: 'Cliente de ejemplo', taxId: '00000000T',
  email: 'cliente@example.test', phone: '', address: 'Calle Cliente, 20\n08002 Barcelona', notes: '',
}
const invoice: Invoice = {
  id: 'test-invoice', tenantId: tenant.id, number: 'F-2026-002', estimateId: 'test-estimate',
  milestoneId: 'test-milestone', clientId: client.id, concept: 'Reforma de habitación · Inicio',
  totalCents: 24200, paidCents: 0, vatRate: 21, status: 'issued',
  issuedAt: '2026-10-13', dueDate: '2026-10-28',
}
const render = (issuer = tenant, bill = invoice) => renderToStaticMarkup(
  <InvoiceDocument invoice={bill} client={client} tenant={issuer} estimateNumber="P-2026-001" />,
)

describe('InvoiceDocument', () => {
  it('uses the company branding and legal details saved in Settings', () => {
    const html = render()

    expect(html).toContain('--invoice-brand:#8354c8')
    expect(html).toContain('src="https://example.test/logo.png"')
    for (const value of [tenant.name, tenant.legalName, tenant.taxId, tenant.address, tenant.city,
    tenant.postalCode, tenant.email, tenant.phone, tenant.website, tenant.iban, tenant.documentFooter]) {
      expect(html).toContain(value)
    }
  })

  it('includes the recipient, invoice dates, reference and payment instructions', () => {
    const html = render()

    for (const value of [client.name, client.taxId, client.address, client.email, invoice.number,
    invoice.concept, '13/10/2026', '28/10/2026', 'P-2026-001', 'Transferencia bancaria']) {
      expect(html).toContain(value)
    }
    expect(html).toContain('Indica F-2026-002 como concepto')
  })

  it('keeps the actual milestone amount and tax breakdown, not the full estimate total', () => {
    const html = render()

    expect(html).toContain(formatEuros(20000))
    expect(html).toContain(formatEuros(4200))
    expect(html).toContain(formatEuros(24200))
    expect(html).toContain('IVA 21%')
    expect(html).toContain('Total factura')
  })

  it('handles invoices with no VAT without changing the total', () => {
    const html = render(tenant, { ...invoice, totalCents: 10001, vatRate: 0 })

    expect(html).toContain(formatEuros(10001))
    expect(html).toContain(formatEuros(0))
    expect(html).toContain('IVA 0%')
  })

  it('marks paid invoices as settled without asking the client to pay again', () => {
    const html = render(tenant, { ...invoice, status: 'paid', paidCents: invoice.totalCents })

    expect(html).toContain('Factura cobrada · Sin importe pendiente.')
    expect(html).not.toContain('como concepto de la transferencia')
    expect(html).not.toContain('Fecha límite de pago:')
  })

  it('uses a clean default when branding and optional company fields are absent', () => {
    const html = render({
      id: tenant.id, name: 'Empresa', taxId: '', email: '', phone: '',
      brandColor: 'invalid', defaultVatRate: 21, defaultDepositPercent: 30, nextEstimateNumber: 1,
    })

    expect(html).toContain('--invoice-brand:#2a4227')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('IBAN:')
    expect(html).not.toContain('NIF / CIF: </p>')
  })

  it('uses the very same document markup inside the preview', () => {
    const document = <InvoiceDocument invoice={invoice} client={client} tenant={tenant} />
    const html = renderToStaticMarkup(<DocumentPreview>{document}</DocumentPreview>)

    const markup = renderToStaticMarkup(document)
    // React 19 hoists image preload links outside the article in both renderings.
    expect(html).toContain(markup.slice(markup.indexOf('<article')))
    expect(html).toContain('invoice-document invoice-sheet')
    expect(html).toContain('A4 · El mismo documento que guardarás en PDF')
    expect(html).not.toContain('sm:flex-row')
  })

  it('defines fixed A4 paper geometry for screen and print', () => {
    const css = readFileSync(new URL('./invoice-document.css', import.meta.url), 'utf8')

    expect(css).toContain('width: 210mm')
    expect(css).toContain('min-height: 297mm')
    expect(css).toContain('@page invoice')
    expect(css).toContain('size: A4 portrait')
    expect(css).toContain('print-color-adjust: exact')
    expect(css).not.toContain('@media (max-width:')
  })

  it('renders the custom footer as text rather than executable HTML', () => {
    const html = render({ ...tenant, documentFooter: '<script>alert(1)</script>' })

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })
})
