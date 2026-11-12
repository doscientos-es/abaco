import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ContractsPage } from './contracts-page'

const state = vi.hoisted(() => ({
  tab: undefined as 'trabajos' | undefined,
  navigate: vi.fn(),
  selectTab: undefined as ((key: string) => void) | undefined,
  queries: [] as unknown[][],
}))

vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    Button: Container,
    Card: Container,
    CardContent: Container,
    Tabs: ({
      children,
      onSelectionChange,
    }: {
      children: ReactNode
      onSelectionChange: (key: string) => void
    }) => {
      state.selectTab = onSelectionChange
      return <div>{children}</div>
    },
    TabsContent: Container,
    TabsList: Container,
    TabsTrigger: Container,
  }
})
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({ tab: state.tab }),
  useNavigate: () => state.navigate,
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
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    state.queries.push(queryKey)
    if (queryKey[0] === 'service-contracts')
      return { isSuccess: true, data: { items: [], count: 0, pageSize: 20 } }
    return {
      data: {
        items: [
          {
            id: 'job-1',
            title: 'Limpieza',
            configured: false,
            contract: {
              id: 'contract-1',
              client_id: 'client-1',
              title: 'Contrato A',
              status: 'active',
            },
          },
        ],
        count: 1,
        pageSize: 20,
      },
    }
  },
}))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({ tenant: { id: 'tenant' }, clients: [{ id: 'client-1', name: 'Ana' }] }),
}))
vi.mock('@/shared/ui/page-states', () => ({ EmptyPanel: () => null }))
vi.mock('../application/contract-actions', () => ({ listServiceContracts: vi.fn() }))
vi.mock('../application/cleaning-service-actions', () => ({ listContractJobs: vi.fn() }))

describe('contracts navigation', () => {
  beforeEach(() => {
    state.tab = undefined
    state.queries = []
    state.selectTab = undefined
    state.navigate.mockClear()
  })

  it('opens the contract list first and switches to contracted jobs', () => {
    const html = renderToStaticMarkup(<ContractsPage />)
    expect(html).toContain('Contratos de servicio')
    expect(html).toContain('href="/trabajos"')
    expect(state.queries.map((key) => key[0])).toEqual(['service-contracts'])
    state.selectTab?.('trabajos')
    expect(state.navigate).toHaveBeenCalledWith({ to: '/contratos', search: { tab: 'trabajos' } })
  })

  it('lists contracted jobs with links to their contract and job', () => {
    state.tab = 'trabajos'
    const html = renderToStaticMarkup(<ContractsPage />)
    expect(state.queries.map((key) => key[0])).toEqual(['contract-jobs'])
    expect(html).toContain('href="/contratos/contract-1#job-1"')
    expect(html).toContain('Pendiente de configurar')
    state.selectTab?.('contratos')
    expect(state.navigate).toHaveBeenCalledWith({ to: '/contratos', search: {} })
  })
})
