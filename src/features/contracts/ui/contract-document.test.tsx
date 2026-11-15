import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { Client, Tenant } from '@/shared/domain/types'

import type { ServiceContract } from '../application/contract-actions'

const query = vi.hoisted(() => ({ result: {} as Record<string, unknown> }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => query.result }))
vi.mock('@/features/estimates/ui/estimate-document', () => ({
  EstimateDocument: () => <p>Texto íntegro de la oferta aceptada</p>,
}))
vi.mock('./apply-contract-template-button', () => ({
  ApplyContractTemplateButton: () => <button>Actualizar plantilla</button>,
}))

import { ContractDocument } from './contract-document'

const contract = {
  tenant_id: 'tenant',
  origin_estimate_id: 'estimate',
  title: 'Limpieza',
  status: 'draft',
  starts_on: '2026-01-01',
  ends_on: '2026-12-31',
  renewal_mode: 'pending',
  price_cents: 100000,
  billing_frequency: 'monthly',
  included_scope: [{ description: 'Portales' }],
  notes: 'Acceso por la mañana',
} as ServiceContract
const tenant = { name: 'Empresa actual', taxId: 'B123' } as Tenant
const client = { name: 'Cliente actual' } as Client

describe('documento del contrato', () => {
  it('incluye la copia aceptada y señala que el contrato es un borrador', () => {
    query.result = {
      data: {
        tenant: { name: 'Empresa aceptada' },
        client: { name: 'Cliente aceptado' },
        estimate: {},
      },
    }
    const html = renderToStaticMarkup(
      <ContractDocument contract={contract} tenant={tenant} client={client} />,
    )
    expect(html).toContain('Empresa aceptada')
    expect(html).toContain('Cliente aceptado')
    expect(html).toContain('Texto íntegro de la oferta aceptada')
    expect(html).toContain('Borrador pendiente de formalización')
    expect(html).toContain('Acceso por la mañana')
  })

  it('impide generar un contrato incompleto si falla la lectura de la oferta', () => {
    query.result = { isError: true }
    const html = renderToStaticMarkup(
      <ContractDocument contract={contract} tenant={tenant} client={client} />,
    )
    expect(html).toContain('No se pudo cargar el presupuesto aceptado')
    expect(html).not.toContain('Imprimir o guardar contrato en PDF')
  })

  it('sitúa las secciones de la copia del contrato alrededor del presupuesto y antes de las firmas', () => {
    query.result = {
      data: { tenant: { name: 'Empresa' }, client: { name: 'Cliente' }, estimate: {} },
    }
    const html = renderToStaticMarkup(
      <ContractDocument
        contract={{
          ...contract,
          document_sections: {
            before: [
              { id: '1', title: 'Introducción', content: 'Texto inicial', pageBreakBefore: true },
            ],
            after: [
              { id: '2', title: 'Cláusulas', content: 'Texto final', pageBreakBefore: false },
            ],
          },
        }}
        tenant={tenant}
        client={client}
      />,
    )
    expect(html).toContain('Texto final')
    expect(html.indexOf('Texto inicial')).toBeLessThan(
      html.indexOf('Texto íntegro de la oferta aceptada'),
    )
    expect(html.indexOf('Texto íntegro de la oferta aceptada')).toBeLessThan(
      html.indexOf('Texto final'),
    )
    expect(html.indexOf('Texto final')).toBeLessThan(html.indexOf('Firma del prestador'))
    expect(html).toContain('data-page-break="true"')
  })

  it('mantiene el orden histórico de un contrato sin copia de plantilla', () => {
    query.result = { data: { tenant, client, estimate: {} } }
    const html = renderToStaticMarkup(
      <ContractDocument
        contract={{ ...contract, document_sections: null }}
        tenant={tenant}
        client={client}
      />,
    )
    expect(html.indexOf('Firma del prestador')).toBeLessThan(
      html.indexOf('Texto íntegro de la oferta aceptada'),
    )
  })

  it('solo ofrece actualizar la plantilla en borradores sin firmar y con permiso', () => {
    query.result = { data: { tenant, client, estimate: {} } }
    const render = (overrides: Partial<ServiceContract>, canEdit: boolean) =>
      renderToStaticMarkup(
        <ContractDocument
          contract={{ ...contract, ...overrides }}
          tenant={tenant}
          client={client}
          canEdit={canEdit}
        />,
      )
    expect(render({}, true)).toContain('Actualizar plantilla')
    expect(render({}, false)).not.toContain('Actualizar plantilla')
    expect(render({ signed_at: '2026-01-01' }, true)).not.toContain('Actualizar plantilla')
    expect(render({ status: 'active' }, true)).not.toContain('Actualizar plantilla')
  })
})
