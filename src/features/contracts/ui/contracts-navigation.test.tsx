import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ContractsPage } from './contracts-page'

const state = vi.hoisted(() => ({
  tab: undefined as 'trabajos' | undefined,
  navigate: vi.fn(),
  selectTab: undefined as ((key: string) => void) | undefined,
  queries: [] as unknown[][],
  states: [] as unknown[],
  cursor: 0,
  filter: undefined as ((value: string) => void) | undefined,
  actions: new Map<string, () => void>(),
  statuses: [] as string[],
  loadContracts: vi.fn(),
  queryFn: undefined as (() => Promise<unknown>) | undefined,
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: (initial: unknown) => {
    const index = state.cursor++
    if (!(index in state.states)) state.states[index] = initial
    return [
      state.states[index],
      (value: unknown) => {
        state.states[index] = value
      },
    ]
  },
}))
vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    Button: ({ children, onPress }: { children: string; onPress: () => void }) => {
      state.actions.set(children, onPress)
      return <button>{children}</button>
    },
    Badge: Container,
    Card: Container,
    CardContent: Container,
    Table: ({ children }: { children: ReactNode }) => <table>{children}</table>,
    TableHeader: ({ children }: { children: ReactNode }) => <thead>{children}</thead>,
    TableBody: ({ children }: { children: ReactNode }) => <tbody>{children}</tbody>,
    TableRow: ({ children }: { children: ReactNode }) => <tr>{children}</tr>,
    TableHead: ({ children }: { children: ReactNode }) => <th>{children}</th>,
    TableCell: ({ children }: { children: ReactNode }) => <td>{children}</td>,
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
  useQuery: ({ queryKey, queryFn }: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => {
    state.queries.push(queryKey)
    if (queryKey[0] === 'service-contracts') {
      state.queryFn = queryFn
      return {
        isSuccess: true,
        data: {
          items: state.statuses.map((status, index) => ({
            id: `contract-${index}`,
            title: `Contrato ${index}`,
            client_id: 'client-1',
            status,
            price_cents: 10000,
            billing_frequency: 'monthly',
          })),
          count: state.statuses.length ? 40 : 0,
          pageSize: 20,
        },
      }
    }
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
vi.mock('@/shared/ui/form', () => ({
  SelectField: ({
    label,
    value,
    onChange,
  }: {
    label: string
    value: string
    onChange: (value: string) => void
  }) => {
    state.filter = onChange
    return <span aria-label={label}>{value}</span>
  },
}))
vi.mock('../application/contract-actions', () => ({ listServiceContracts: state.loadContracts }))
vi.mock('../application/cleaning-service-actions', () => ({ listContractJobs: vi.fn() }))
vi.mock('./contract-actions', () => ({
  ContractActions: ({ contract }: { contract: { title: string } }) => (
    <button aria-label={`Acciones de ${contract.title}`}>Acciones</button>
  ),
}))

describe('contracts navigation', () => {
  beforeEach(() => {
    state.tab = undefined
    state.queries = []
    state.selectTab = undefined
    state.navigate.mockClear()
    state.states = []
    state.cursor = 0
    state.filter = undefined
    state.actions.clear()
    state.statuses = []
    state.loadContracts.mockClear()
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

  it('shows only active/inactive labels for every persisted lifecycle state', () => {
    state.statuses = ['draft', 'active', 'paused', 'expired', 'canceled']
    const html = renderToStaticMarkup(<ContractsPage />)
    expect(html.match(/>Activo</g)).toHaveLength(1)
    expect(html.match(/>Inactivo</g)).toHaveLength(4)
    for (const label of ['Borrador', 'Pausado', 'Vencido', 'Cancelado']) {
      expect(html).not.toContain(label)
    }
  })

  it('lists contracts in a table with signature status and an action menu per row', () => {
    state.statuses = ['draft', 'active']
    const html = renderToStaticMarkup(<ContractsPage />)
    expect(html).toContain('<table>')
    for (const heading of [
      'Contrato',
      'Cliente',
      'Estado',
      'Firma',
      'Importe',
      'Facturación',
      'Acciones',
    ]) {
      expect(html).toContain(`<th>${heading}</th>`)
    }
    expect(html.match(/Pendiente de firma/g)).toHaveLength(2)
    expect(html).toContain('href="/contratos/contract-0"')
    expect(html).toContain('aria-label="Acciones de Contrato 0"')
    expect(html).toContain('aria-label="Acciones de Contrato 1"')
  })

  it('resets pagination and uses a distinct server query when filtering by status', async () => {
    state.statuses = ['active']
    const render = () => {
      state.cursor = 0
      return renderToStaticMarkup(<ContractsPage />)
    }
    render()
    state.actions.get('Siguiente')?.()
    render()
    expect(state.queries.at(-1)).toEqual(['service-contracts', 'tenant', 1, 'all'])
    for (const status of ['inactive', 'active', 'all']) {
      state.filter?.(status)
      render()
      expect(state.queries.at(-1)).toEqual(['service-contracts', 'tenant', 0, status])
      await state.queryFn?.()
      expect(state.loadContracts).toHaveBeenLastCalledWith('tenant', 0, status)
    }
  })
})
