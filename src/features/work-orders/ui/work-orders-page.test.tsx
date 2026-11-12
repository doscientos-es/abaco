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
  role: 'admin',
  selectTab: undefined as ((key: string) => void) | undefined,
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
vi.mock('@/features/auth', () => ({ can: () => true, useSession: () => ({ role: state.role }) }))
vi.mock('@/features/visits', () => ({
  AgendaPage: () => <h2>Planificación compartida TEST</h2>,
  ReportReviewInbox: () => <h2>Revisión TEST</h2>,
  ReportReviewTabLabel: () => <>Partes por revisar</>,
}))
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
  state.role = 'admin'
  state.clearFilters = undefined
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
  it.each([
    ['planificacion', 'Planificación compartida TEST'],
    ['revision', 'Revisión TEST'],
    ['anteriores', 'Consulta y termina los registros del modelo anterior'],
  ] as const)('shows only the selected section for %s', (tab, content) => {
    state.search.tab = tab
    const html = renderToStaticMarkup(<WorkOrdersPage />)
    expect(html).toContain(content)
    for (const other of ['Planificación compartida TEST', 'Revisión TEST']) {
      if (other !== content) expect(html).not.toContain(other)
    }
    expect(html).toContain('Partes por revisar')
    expect(html).not.toContain('Trabajos contratados')
    expect(html).toContain('Trabajos anteriores')
    if (tab !== 'anteriores') expect(state.queries).toEqual([])
  })

  it('preserves planning and historical filters when switching sections', () => {
    renderToStaticMarkup(<WorkOrdersPage />)
    state.selectTab?.('revision')
    const navigation = state.navigate.mock.calls.at(-1)?.[0] as {
      search: (previous: WorkSearch) => WorkSearch
    }
    expect(navigation.search(state.search)).toEqual({ ...state.search, tab: 'revision' })
  })

  it('does not expose report review to non-admin users', () => {
    state.role = 'user'
    state.search.tab = 'revision'
    const html = renderToStaticMarkup(<WorkOrdersPage />)
    expect(html).not.toContain('Partes por revisar')
    expect(html).not.toContain('Revisión TEST')
    expect(html).toContain('Planificación compartida TEST')
  })

  it('clears only historical filters without resetting calendar planning', () => {
    state.search.tab = 'anteriores'
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
      tab: 'anteriores',
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
