import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SuperadminPage } from './superadmin-page'

const state = vi.hoisted(() => ({ allowed: false, queries: [] as string[] }))
vi.mock('@/features/auth', () => ({ useSession: () => ({ userId: 'platform-user' }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}))
vi.mock('@tanstack/react-query', () => ({
  queryOptions: <T,>(options: T) => options,
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    state.queries.push(queryKey[0] ?? '')
    if (queryKey[0] === 'platform-access') return { data: state.allowed }
    if (queryKey[0] === 'platform-companies')
      return {
        data: [
          {
            id: 'company',
            name: 'Empresa de prueba',
            plan: 'team',
            subscription_status: 'active',
            member_count: 3,
            current_period_end: null,
          },
        ],
      }
    throw new Error('Unexpected query')
  },
}))

describe('platform administration access', () => {
  beforeEach(() => {
    state.allowed = false
    state.queries = []
  })

  it('does not request company data when the user lacks platform access', () => {
    const html = renderToStaticMarkup(<SuperadminPage />)
    expect(html).toContain('No tienes acceso')
    expect(state.queries).toEqual(['platform-access'])
  })

  it('shows company information after platform access is confirmed', () => {
    state.allowed = true
    const html = renderToStaticMarkup(<SuperadminPage />)
    expect(html).toContain('Empresa de prueba')
    expect(html).toContain('3 personas')
    expect(state.queries).toEqual(['platform-access', 'platform-companies'])
  })
})
