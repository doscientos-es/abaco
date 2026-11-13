import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Estimate, Tenant } from '@/shared/domain/types'

import { EstimateDocument } from './estimate-document'

const id = (value: number) => `82000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const estimate: Estimate = {
  id: id(1),
  tenantId: id(2),
  clientId: id(3),
  number: 'P-1',
  title: 'Servicio de limpieza',
  status: 'sent',
  lines: [
    {
      id: id(4),
      catalogItemId: null,
      description: 'Limpieza ordinaria',
      kind: 'labor',
      unit: 'ud',
      quantity: 1,
      unitPriceCents: 10_000,
      discountPercent: 0,
    },
  ],
  milestones: [],
  discountType: 'none',
  discountValue: 0,
  vatRate: 21,
  clauses: 'Condiciones originales',
  validUntil: '2027-01-01',
  createdAt: '2026-11-13',
}
const tenant: Tenant = {
  id: id(2),
  name: 'Empresa',
  taxId: '',
  phone: '',
  email: '',
  defaultVatRate: 21,
  defaultDepositPercent: 30,
  nextEstimateNumber: 1,
}

describe('customer-facing estimate', () => {
  it('preserves the traditional table and conditions for historical proposals', () => {
    const html = renderToStaticMarkup(
      <EstimateDocument estimate={estimate} tenant={tenant} client={undefined} />,
    )
    expect(html).toContain('Limpieza ordinaria')
    expect(html).toContain('Condiciones originales')
    expect(html).not.toContain('data-page-break')
  })

  it('renders every section in order, escapes text and counts prices only once', () => {
    const html = renderToStaticMarkup(
      <EstimateDocument
        estimate={{
          ...estimate,
          documentFormat: 'sections',
          clauses: '',
          sections: [
            {
              id: id(10),
              type: 'description',
              title: 'Presentación',
              pageBreakBefore: false,
              content: '<script>alert(1)</script>\nServicio integral',
            },
            {
              id: id(11),
              type: 'work_table',
              title: 'Plan de trabajo',
              pageBreakBefore: true,
              rows: [{ id: id(12), task: 'Cristales', frequency: 'Semanal', notes: 'Portal' }],
            },
            {
              id: id(13),
              type: 'list',
              title: 'Incluye',
              pageBreakBefore: false,
              items: [{ id: id(14), text: 'Productos profesionales' }],
            },
            {
              id: id(15),
              type: 'prices',
              title: 'Oferta económica',
              pageBreakBefore: false,
              lineIds: [id(4)],
            },
          ],
        }}
        tenant={tenant}
        client={undefined}
      />,
    )
    expect(html.indexOf('Presentación')).toBeLessThan(html.indexOf('Plan de trabajo'))
    expect(html.indexOf('Plan de trabajo')).toBeLessThan(html.indexOf('Incluye'))
    expect(html.indexOf('Incluye')).toBeLessThan(html.indexOf('PRESUPUESTO ÚNICO. -'))
    expect(html).toContain('Semanal')
    expect(html).toContain('Productos profesionales')
    expect(html).toContain('data-page-break="true"')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html.match(/<table/g)).toHaveLength(1)
    expect(html).not.toContain('Concepto')
    expect(html).toContain('CIENTO VEINTIÚN EUROS (121,00.-) impuestos incluidos.')
    expect(html.match(/Base imponible/g)).toHaveLength(1)
    expect(html).not.toContain('Condiciones originales')
  })

  it('renders the agreed monthly price as a paragraph, not a table of quantities or services', () => {
    const html = renderToStaticMarkup(
      <EstimateDocument
        estimate={{
          ...estimate,
          documentFormat: 'sections',
          conversionDestination: 'contract',
          contractBillingFrequency: 'monthly',
          lines: estimate.lines.map((line) => ({ ...line, unitPriceCents: 17_878 })),
          sections: [
            {
              id: id(10),
              type: 'prices',
              title: 'Precio',
              pageBreakBefore: false,
              lineIds: [id(4)],
            },
          ],
        }}
        tenant={tenant}
        client={undefined}
      />,
    )
    expect(html).toContain('PRESUPUESTO MENSUAL. -')
    expect(html).toContain(
      'Asciende el presente presupuesto a la cantidad MENSUAL de DOSCIENTOS DIECISÉIS EUROS CON TREINTA Y DOS CÉNTIMOS (216,32.-) impuestos incluidos.',
    )
    expect(html).not.toContain('<table')
    expect(html).not.toContain('Limpieza ordinaria')
    expect(html).toContain('216,32')
  })

  it('allows long sections to paginate instead of forcing them onto one page', () => {
    const css = readFileSync(new URL('./estimate-document.css', import.meta.url), 'utf8')
    expect(css).toContain('break-before: page')
    expect(css).toMatch(/\.estimate-document section\s*\{\s*break-inside: auto/)
    expect(css).toContain('display: table-header-group')
  })
})
