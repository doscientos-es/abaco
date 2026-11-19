import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { defaultEstimateDesign } from '@/shared/domain/estimate-design'
import type { Estimate, Tenant } from '@/shared/domain/types'

import { EstimateDocument } from './estimate-document'
import { EstimatePageFlow, estimatePageCount } from './estimate-page-flow'

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
    expect(html).toContain('3. Forma de pago')
    expect(html).toContain('4. Descripción y condiciones')
    expect(html).toContain('Condiciones originales')
    expect(html).toContain('Base imponible')
    expect(html).toContain('IVA 21%')
    expect(html).not.toContain('data-page-break')
    expect(html).toContain('estimate-document__cover')
    expect(html).toContain('estimate-document__index')
    expect(html).toContain('estimate-document__content')
    expect(html.indexOf('estimate-document__cover')).toBeLessThan(
      html.indexOf('estimate-document__index'),
    )
    expect(html.indexOf('estimate-document__index')).toBeLessThan(
      html.indexOf('estimate-document__content'),
    )
  })

  it('flows the compact header and prices together without blank cover or index pages', () => {
    const html = renderToStaticMarkup(
      <EstimateDocument
        estimate={{ ...estimate, documentDesign: { ...defaultEstimateDesign, layout: 'compact' } }}
        tenant={{ ...tenant, logoUrl: 'https://example.test/logo.svg', documentFooter: 'Gracias' }}
        client={undefined}
      />,
    )
    expect(html).toContain('estimate-document__compact-header')
    expect(html).not.toContain('estimate-document__cover')
    expect(html).not.toContain('estimate-document__index')
    expect(html).toMatch(/Página (?:<!-- -->)?1(?:<!-- -->)? de (?:<!-- -->)?1/)
    expect(html).toContain('Limpieza ordinaria')
    expect(html).toContain('Base imponible')
    expect(html).toContain('logo.svg')
    expect(html).toContain('Gracias')
  })

  it.each(['minimal', 'editorial'] as const)('renders the %s preset without a cover', (layout) => {
    const html = renderToStaticMarkup(
      <EstimateDocument
        estimate={{ ...estimate, documentDesign: { ...defaultEstimateDesign, layout } }}
        tenant={tenant}
        client={undefined}
      />,
    )
    expect(html).toContain(`data-layout="${layout}"`)
    expect(html).toContain('estimate-document__compact-header')
    expect(html).not.toContain('estimate-document__index')
    expect(html).toContain('Limpieza ordinaria')
  })

  it('omits optional branding and index without changing the proposal cover or payment content', () => {
    const html = renderToStaticMarkup(
      <EstimateDocument
        estimate={{
          ...estimate,
          documentDesign: {
            layout: 'proposal',
            showIndex: false,
            showLogo: false,
            showFooter: false,
          },
        }}
        tenant={{ ...tenant, logoUrl: 'https://example.test/logo.svg', documentFooter: 'Gracias' }}
        client={undefined}
      />,
    )
    expect(html).toContain('estimate-document__cover')
    expect(html).not.toContain('estimate-document__index')
    expect(html).not.toContain('logo.svg')
    expect(html).not.toContain('Gracias')
    expect(html).toContain('Forma de pago')
    expect(html).toContain('Conforme del cliente')
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
              rows: [
                { id: id(12), task: 'Cristales', frequency: 'Semanal', notes: 'Portal' },
                {
                  id: id(16),
                  task: 'Puerta principal',
                  frequency: '',
                  notes: 'Sin lejía',
                  periodicities: ['daily', 'monthly'],
                },
              ],
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
    expect(html).toContain('1. Presentación')
    expect(html).toContain('2. Plan de trabajo')
    expect(html).toContain('3. Incluye')
    expect(html).toContain('4. PRESUPUESTO ÚNICO. -')
    const index = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'))
    const content = html.slice(html.indexOf('estimate-document__content'))
    for (const heading of [
      '1. Presentación',
      '2. Plan de trabajo',
      '3. Incluye',
      '4. PRESUPUESTO ÚNICO. -',
    ]) {
      expect(index).toContain(heading)
      expect(content).toContain(heading)
    }
    expect(html.indexOf('1. Presentación')).toBeLessThan(html.indexOf('2. Plan de trabajo'))
    expect(html.indexOf('2. Plan de trabajo')).toBeLessThan(html.indexOf('3. Incluye'))
    expect(html.indexOf('3. Incluye')).toBeLessThan(html.indexOf('4. PRESUPUESTO ÚNICO. -'))
    expect(html).toContain('Semanal')
    expect(html.match(/>X<\/span>/g)).toHaveLength(3)
    expect(html).toContain('Puerta principal')
    expect(html).toContain('Sin lejía')
    expect(html).toContain('Productos profesionales')
    expect(html).toContain('data-page-break="true"')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html.match(/<table/g)).toHaveLength(1)
    expect(html).not.toContain('Concepto')
    expect(html).toContain('CIENTO VEINTIÚN EUROS (121,00.-) impuestos incluidos.')
    expect(html).not.toContain('Resumen económico')
    expect(html).not.toContain('Base imponible')
    expect(html).not.toContain('Condiciones originales')
  })

  it('renumbers section titles when their order changes', () => {
    const sections: NonNullable<Estimate['sections']> = [
      { id: id(10), type: 'description', title: 'Primera', pageBreakBefore: false, content: '' },
      { id: id(11), type: 'description', title: 'Segunda', pageBreakBefore: false, content: '' },
    ]
    const html = renderToStaticMarkup(
      <EstimateDocument
        estimate={{ ...estimate, documentFormat: 'sections', sections: [...sections].reverse() }}
        tenant={tenant}
        client={undefined}
      />,
    )
    expect(html).toContain('1. Segunda')
    expect(html).toContain('2. Primera')
    expect(sections[0]?.title).toBe('Primera')
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
    expect(html).toContain('1. PRESUPUESTO MENSUAL. -')
    expect(html).toContain(
      'Asciende el presente presupuesto a la cantidad MENSUAL de DOSCIENTOS DIECISÉIS EUROS CON TREINTA Y DOS CÉNTIMOS (216,32.-) impuestos incluidos.',
    )
    expect(html).not.toContain('<table')
    expect(html).not.toContain('Limpieza ordinaria')
    expect(html.match(/216,32/g)).toHaveLength(1)
    for (const text of [
      'Resumen económico',
      'Materiales',
      'Mano de obra',
      'Base imponible',
      'IVA 21%',
      'Total por periodo',
      'La vigencia y la planificación de cada trabajo',
    ]) {
      expect(html).not.toContain(text)
    }
  })

  it('renders cover, index and content on separate A4 sheets', () => {
    const html = renderToStaticMarkup(
      <EstimateDocument estimate={estimate} tenant={tenant} client={undefined} />,
    )
    const pages = html.split('class="estimate-document__page"').slice(1)
    expect(pages).toHaveLength(3)
    expect(pages[0]).toContain('estimate-document__cover')
    expect(pages[1]).toContain('estimate-document__index')
    expect(pages[2]).toContain('estimate-document__content')
    pages.forEach((page, index) => {
      expect(page).toContain('Empresa · Presupuesto P-1')
      expect(page).toContain(`Página ${index + 1} de 3`)
    })
  })

  it('numbers overflow pages continuously and keeps repeated content hidden from assistive technology', () => {
    const html = renderToStaticMarkup(
      <EstimatePageFlow
        pageCount={3}
        firstPage={3}
        totalPages={5}
        tenantName="Empresa"
        estimateNumber="P-1"
        onPageCountChange={() => {}}
      >
        <p>Contenido extenso</p>
      </EstimatePageFlow>,
    )
    const pages = html.split('class="estimate-document__page"').slice(1)
    expect(pages).toHaveLength(3)
    pages.forEach((page, index) => expect(page).toContain(`Página ${index + 3} de 5`))
    expect(pages[0]).not.toContain('aria-hidden="true"')
    expect(pages[1]).toContain('class="estimate-document__viewport" aria-hidden="true"')
    expect(pages[2]).toContain('class="estimate-document__viewport" aria-hidden="true"')
  })

  it('retains the custom legal footer at the end of the document', () => {
    const html = renderToStaticMarkup(
      <EstimateDocument
        estimate={estimate}
        tenant={{ ...tenant, documentFooter: 'Condiciones legales\nSegunda línea' }}
        client={undefined}
      />,
    )
    expect(html.match(/Condiciones legales/g)).toHaveLength(1)
    expect(html).toContain('Segunda línea')
    expect(html.indexOf('Condiciones legales')).toBeGreaterThan(
      html.indexOf('Conforme del cliente'),
    )
  })

  it('counts overflow and explicit column breaks without losing long content', () => {
    expect(estimatePageCount(688, 688)).toBe(1)
    expect(estimatePageCount(1376, 688)).toBe(2)
    expect(estimatePageCount(2064, 688)).toBe(3)
    expect(estimatePageCount(0, 0)).toBe(1)
  })

  it('shares A4 geometry and section breaks between preview and print', () => {
    const css = readFileSync(new URL('./estimate-document.css', import.meta.url), 'utf8')
    expect(css).toContain('width: 210mm')
    expect(css).toContain('height: 297mm')
    expect(css).toContain('height: 253mm')
    expect(css).toContain('height: 16mm')
    expect(css).toContain('column-fill: auto')
    expect(css).toContain('break-before: column')
    expect(css).toContain('@page estimate')
    expect(css).toContain('break-before: page')
    expect(css).toMatch(/\.estimate-document section\s*\{\s*break-inside: auto/)
    expect(css).toContain('display: table-header-group')
  })

  it('keeps the unpaginated contract annex available for contract printing', () => {
    const html = renderToStaticMarkup(
      <EstimateDocument estimate={estimate} tenant={tenant} client={undefined} paginated={false} />,
    )
    expect(html).not.toContain('estimate-document__page')
    expect(html).not.toContain('Página 1 de')
    expect(html).toContain('Condiciones originales')
  })
})
