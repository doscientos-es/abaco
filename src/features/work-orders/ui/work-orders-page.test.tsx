import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkSearch } from '../domain/work-search'
import { WorkOrdersPage } from './work-orders-page'

const state = vi.hoisted(() => ({
  search: {} as WorkSearch,
  navigate: vi.fn(),
  clearFilters: undefined as (() => void) | undefined,
  queries: [] as unknown[][],
}))
vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => {
      if (children === 'Limpiar filtros') state.clearFilters = onPress
      return <button>{children}</button>
    },
    PageHeader: Container,
    PageHeaderDescription: Container,
    PageHeaderHeading: Container,
    PageHeaderTitle: Container,
    Skeleton: () => null,
  }
})
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => state.search,
  useNavigate: () => state.navigate,
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    state.queries.push(queryKey)
    return {
      data: queryKey[0] === 'work-orders' ? { items: [], count: 0, pageSize: 20 } : [],
      isSuccess: true,
    }
  },
}))
vi.mock('@/features/auth', () => ({ can: () => true, useSession: () => ({ role: 'admin' }) }))
vi.mock('@/features/contracts', () => ({
  ContractJobsPage: () => <h2>Trabajos contratados TEST</h2>,
}))
vi.mock('@/features/visits', () => ({ AgendaPage: () => <h1>Planificación compartida TEST</h1> }))
vi.mock('@/features/work-teams', () => ({
  workTeamLabel: vi.fn(),
  workTeamsQuery: () => ({ queryKey: ['teams'] }),
}))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({ tenant: { id: 'tenant' }, clients: [] }),
}))
vi.mock('@/shared/ui/form', () => ({ SelectField: () => null }))
vi.mock('@/shared/ui/page-states', () => ({
  EmptyPanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('../application/work-order-actions', () => ({ listWorkOrders: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  state.queries = []
  state.search = {
    view: 'calendar',
    date: '2026-11-13',
    period: 'week',
    team: 'unassigned',
    estado: 'completed',
    pagina: 2,
  }
})

describe('unified work module', () => {
  it('keeps planning, contract configuration and historical work accessible in one page', () => {
    const html = renderToStaticMarkup(<WorkOrdersPage />)
    expect(html).toContain('Planificación compartida TEST')
    expect(html).toContain('Trabajos contratados TEST')
    expect(html).toContain('Trabajos anteriores e independientes')
    expect(html).not.toContain('href="/agenda"')
  })

  it('clears only historical filters without resetting calendar planning', () => {
    renderToStaticMarkup(<WorkOrdersPage />)
    state.clearFilters?.()
    const navigation = state.navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: WorkSearch) => WorkSearch
    }
    expect(navigation.search(state.search)).toEqual({
      view: 'calendar',
      date: '2026-11-13',
      period: 'week',
      team: 'unassigned',
      equipo: undefined,
      estado: undefined,
      pagina: undefined,
    })
    expect(state.queries.find((key) => key[0] === 'work-orders')).toEqual([
      'work-orders',
      'tenant',
      2,
      { equipo: undefined, estado: 'completed' },
    ])
  })
})
