import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContractJobListItem } from '../infrastructure/cleaning-service-repository'
import { ContractJobsPage } from './contract-jobs-page'

const state = vi.hoisted(() => ({ items: [] as ContractJobListItem[], error: false }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: state.error ? undefined : { items: state.items, count: state.items.length, pageSize: 20 },
    isPending: false,
    isError: state.error,
    error: new Error('Sin conexión'),
    refetch: vi.fn(),
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    hash,
  }: {
    children: ReactNode
    to: string
    params?: { contractId: string }
    hash?: string
  }) => (
    <a href={`${to.replace('$contractId', params?.contractId ?? '')}${hash ? `#${hash}` : ''}`}>
      {children}
    </a>
  ),
}))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({
    tenant: { id: 'tenant' },
    clients: [{ id: 'client', name: 'Office TEST' }],
  }),
}))

beforeEach(() => {
  state.items = []
  state.error = false
})

describe('contracted jobs list', () => {
  it('links each quoted item to its agreement without showing placeholder scheduling', () => {
    state.items = [
      {
        id: 'job',
        title: 'Clean windows',
        configured: false,
        frequency: 'once',
        modality: 'mobile',
        location: null,
        contract: {
          id: 'agreement',
          title: 'Office cleaning',
          client_id: 'client',
          status: 'draft',
        },
      },
    ]
    const html = renderToStaticMarkup(<ContractJobsPage />)
    expect(html).toContain('/contratos/agreement#job')
    expect(html).toContain('Office TEST')
    expect(html).toContain('Pendiente de configurar')
    expect(html).toContain('Borrador')
    expect(html).not.toContain('Una sola vez')
    expect(html).not.toContain('Órdenes por visita')
  })

  it('explains the source of jobs and their planning in the global view', () => {
    const html = renderToStaticMarkup(<ContractJobsPage />)
    expect(html).toContain('partidas del presupuesto aceptado')
    expect(html).toContain('planificación global')
    expect(html).not.toContain('href="/agenda"')
    expect(html).not.toContain('Nuevo trabajo')
  })

  it('does not present a failed query as an empty list', () => {
    state.error = true
    const html = renderToStaticMarkup(<ContractJobsPage />)
    expect(html).toContain('Sin conexión')
    expect(html).toContain('Reintentar')
    expect(html).not.toContain('Aún no hay trabajos')
  })
})
