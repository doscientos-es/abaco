import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { Client, Tenant } from '@/shared/domain/types'

import type { ServiceContract } from '../application/contract-actions'

const query = vi.hoisted(() => ({ result: {} as Record<string, unknown> }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => query.result }))
vi.mock('@/features/estimates/ui/estimate-document', () => ({
  EstimateDocument: () => <p>Texto íntegro de la oferta aceptada</p>,
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
})
