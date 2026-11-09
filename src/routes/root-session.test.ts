import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionQuery } from '@/features/auth/application/auth-actions'

import { Route } from './__root'

const { loadSession, hydrateStore } = vi.hoisted(() => ({
  loadSession: vi.fn(),
  hydrateStore: vi.fn(),
}))

vi.mock('@/features/auth/infrastructure/load-session', () => ({ loadSession }))
vi.mock('@/features/auth', async () => ({
  sessionQuery: (await import('@/features/auth/application/auth-actions')).sessionQuery,
  NoCompanyPage: () => null,
  welcomeRedirect: () => null,
}))
vi.mock('@/app/app-frame', () => ({ AppFrame: () => null }))
vi.mock('@/app/technician-frame', () => ({ UserFrame: () => null }))
vi.mock('@/shared/store/store', () => ({
  hydrateStore,
  refreshStore: vi.fn(),
  setActiveTenantId: vi.fn(),
}))

describe('root session guard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('reloads an invalidated anonymous session before entering the dashboard', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const beforeLoad = Route.options.beforeLoad
    if (!beforeLoad) throw new Error('Root session guard is missing')
    const visit = (path: string) =>
      beforeLoad({
        context: { queryClient },
        location: { pathname: path, href: path },
      } as Parameters<typeof beforeLoad>[0])
    const session = {
      userId: 'user-1',
      email: 'user@example.test',
      fullName: 'User',
      tenantId: 'company-1',
      role: 'admin',
      companies: [],
      needsWelcome: false,
    }
    loadSession.mockResolvedValueOnce(null).mockResolvedValueOnce(session)
    hydrateStore.mockResolvedValue(undefined)

    await expect(visit('/entrar')).resolves.toEqual({ session: null })
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toBeNull()

    await expect(visit('/')).resolves.toEqual({ session })
    expect(loadSession).toHaveBeenCalledTimes(2)
    expect(hydrateStore).toHaveBeenCalledOnce()
    queryClient.clear()
  })

  it('does not reuse an invalidated session when refreshing it fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const beforeLoad = Route.options.beforeLoad
    if (!beforeLoad) throw new Error('Root session guard is missing')
    loadSession.mockResolvedValueOnce({
      userId: 'user-1',
      email: 'user@example.test',
      fullName: 'User',
      tenantId: 'company-1',
      role: 'admin',
      companies: [],
      needsWelcome: false,
    })
    await queryClient.fetchQuery(sessionQuery)
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
    loadSession.mockRejectedValueOnce(new Error('Session unavailable'))

    await expect(
      beforeLoad({
        context: { queryClient },
        location: { pathname: '/', href: '/' },
      } as Parameters<typeof beforeLoad>[0]),
    ).rejects.toThrow('Session unavailable')
    expect(hydrateStore).not.toHaveBeenCalled()
    queryClient.clear()
  })
})
