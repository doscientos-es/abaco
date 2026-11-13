import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TenantData } from '@/shared/domain/types'

import type { SearchItem } from '../domain/search'
import { useSearchResults } from './use-search-results'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  debounced: '',
  refetch: vi.fn(),
  remote: { items: [] as SearchItem[], failed: false },
}))
vi.mock('react', async (load) => ({
  ...(await load<typeof React>()),
  useState: () => [mocks.debounced, vi.fn()],
}))
vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.query }))
vi.mock('@/features/settings/application/team-actions', () => ({
  teamQuery: (id: string) => ({ queryKey: ['team', id] }),
}))
vi.mock('@/features/work-teams', () => ({
  workTeamsQuery: (id: string) => ({ queryKey: ['work-teams', id] }),
}))
const company: TenantData = {
  tenant: {
    id: 'company',
    name: 'Empresa',
    taxId: '',
    email: '',
    phone: '',
    defaultVatRate: 21,
    defaultDepositPercent: 30,
    nextEstimateNumber: 1,
  },
  clients: [],
  estimates: [],
  invoices: [],
  catalog: [],
  ledger: [],
}
const navigation: SearchItem[] = [
  { id: 'nav', title: 'Clientes', category: 'Navegación', target: { to: '/clientes' } },
]
function render(data: TenantData | undefined = company, query = 'Limpieza', open = true) {
  const capture = vi.fn<(snapshot: ReturnType<typeof useSearchResults>) => void>()
  function Probe() {
    capture(useSearchResults(data, navigation, query, open))
    return null
  }
  renderToStaticMarkup(<Probe />)
  return capture.mock.lastCall?.[0]
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.debounced = 'Limpieza'
  mocks.remote = {
    items: [
      {
        id: 'contract:one',
        title: 'Limpieza',
        category: 'Contratos',
        target: { to: '/contratos/$contractId', params: { contractId: 'one' } },
      },
    ],
    failed: false,
  }
  mocks.query.mockImplementation(({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === 'global-search' ? mocks.remote : [],
    isFetching: false,
    isError: false,
    refetch: mocks.refetch,
  }))
})

describe('search query lifecycle', () => {
  it('disables all company queries for navigation-only users or a closed palette', () => {
    // Explicitly pass no company instead of accepting the helper default.
    function NavigationOnly() {
      const results = useSearchResults(undefined, navigation, 'Limpieza', true)
      expect(results.items).toEqual([])
      return null
    }
    renderToStaticMarkup(<NavigationOnly />)
    for (const [options] of mocks.query.mock.calls) expect(options.enabled).toBe(false)
    mocks.query.mockClear()
    render(company, 'Limpieza', false)
    for (const [options] of mocks.query.mock.calls) expect(options.enabled).toBe(false)
  })

  it('keys remote requests by company and query and includes only current results', () => {
    const snapshot = render()
    expect(mocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['global-search', 'company', 'Limpieza'],
        enabled: true,
      }),
    )
    expect(snapshot?.items.map((item) => item.id)).toEqual(['contract:one'])
    snapshot?.retry()
    expect(mocks.refetch).toHaveBeenCalledTimes(3)
  })

  it('hides stale results and failures while a new query is being debounced', () => {
    mocks.remote.failed = true
    const snapshot = render(company, 'Contrato nuevo')
    expect(snapshot?.items).toEqual([])
    expect(snapshot?.loading).toBe(true)
    expect(snapshot?.failed).toBe(false)
    snapshot?.retry()
    expect(mocks.refetch).toHaveBeenCalledTimes(2)
    expect(render(company, '')?.failed).toBe(false)
  })
})
