import { writeFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { it, vi } from 'vitest'
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      tenant: { name: 'Empresa de limpieza', taxId: 'B12345678' },
      client: { name: 'Comunidad Ejemplo', address: 'Calle Principal 1' },
      estimate: {
        title: 'Limpieza de zonas comunes',
        number: 'P-2026-1',
        createdAt: '2026-01-01',
        validUntil: '2026-02-01',
        lines: [
          {
            id: '1',
            description: 'Limpieza mensual',
            quantity: 1,
            unit: 'mes',
            unitPriceCents: 100000,
            discountPercent: 0,
            kind: 'other',
          },
        ],
        discountType: 'none',
        discountValue: 0,
        vatRate: 10,
        milestones: [],
        clauses: 'Limpieza de portales, escaleras y garaje.\nFrecuencia semanal.',
        conversionDestination: 'contract',
        contractBillingFrequency: 'monthly',
      },
    },
  }),
}))
import { ContractDocument } from './contract-document'
it('prepares a visual fixture', () => {
  const contract = {
    tenant_id: 't',
    origin_estimate_id: 'e',
    title: 'Limpieza de la comunidad',
    status: 'draft',
    starts_on: '2026-01-01',
    ends_on: '2026-12-31',
    renewal_mode: 'manual',
    price_cents: 100000,
    billing_frequency: 'monthly',
    included_scope: [
      { description: 'Limpieza de portales' },
      { description: 'Limpieza de garaje' },
    ],
    notes: 'El servicio se realizará según lo indicado en el anexo.',
  }
  const html = renderToStaticMarkup(
    <ContractDocument
      contract={contract as never}
      tenant={{ name: 'Empresa' } as never}
      client={{ name: 'Cliente' } as never}
    />,
  )
  const start = html.indexOf('<article')
  const end = html.lastIndexOf('</article>') + 10
  writeFileSync(
    'contract-visual-fixture.html',
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/STYLE.css"></head><body class="invoice-print">${html.slice(start, end)}</body></html>`,
  )
})
