import type * as UI from '@doscientos/ui'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@doscientos/ui', async (importOriginal) => {
  const ui = await importOriginal<typeof UI>()
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    ...ui,
    Tabs: Container,
    TabsContent: Container,
    TabsList: Container,
    TabsTrigger: Container,
  }
})
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    className,
  }: {
    children: ReactNode
    params?: { contractId: string }
    className?: string
  }) => (
    <a href={params ? `/contratos/${params.contractId}` : '/presupuestos'} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    isSuccess: true,
    data: {
      items: [
        {
          id: 'contract-1',
          title: 'Limpieza de oficinas',
          client_id: 'client-1',
          status: 'active',
          signed_at: null,
          price_cents: 12000,
          billing_frequency: 'monthly',
          next_collection: { due_on: '2026-12-01', is_overdue: false, source: 'invoice' },
        },
      ],
      count: 1,
      pageSize: 20,
    },
  }),
}))
vi.mock('@/features/auth', () => ({ can: () => true, useSession: () => ({ role: 'admin' }) }))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({
    tenant: { id: 'tenant-1' },
    clients: [{ id: 'client-1', name: 'Cliente Ejemplo' }],
  }),
}))
vi.mock('./contract-actions', () => ({
  ContractActions: () => <button>Acciones del contrato</button>,
}))
vi.mock('./contract-jobs-page', () => ({ ContractJobsPage: () => null }))
vi.mock('./contract-template-library', () => ({ ContractTemplateLibrary: () => null }))

import { ContractsPage } from './contracts-page'

describe('contratos en móvil', () => {
  it('muestra tarjetas con datos, enlace y acciones sin perder la tabla de escritorio', () => {
    const html = renderToStaticMarkup(<ContractsPage />)
    const card = html.match(/<ul aria-label="Contratos de servicio".*?<\/ul>/)?.[0]
    expect(card).toContain('md:hidden')
    expect(card).toContain('href="/contratos/contract-1"')
    expect(card).toContain('Limpieza de oficinas')
    expect(card).toContain('Cliente Ejemplo')
    expect(card).toContain('Activo')
    expect(card).toContain('Pendiente de firma')
    expect(card).toContain('01/12/2026')
    expect(card).toContain('120,00')
    expect(card).toContain('Acciones del contrato')
    expect(html).toContain('max-md:hidden')
  })
})
