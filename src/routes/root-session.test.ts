import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionQuery } from '@/features/auth/application/auth-actions'

import { Route } from './__root'

const { loadSession, hydrateStore, tenantAccess, onboardingStatus } = vi.hoisted(() => ({
  loadSession: vi.fn(),
  hydrateStore: vi.fn(),
  tenantAccess: vi.fn(),
  onboardingStatus: vi.fn(),
}))

vi.mock('@/features/auth/infrastructure/load-session', () => ({ loadSession }))
vi.mock('@/features/auth', async () => ({
  sessionQuery: (await import('@/features/auth/application/auth-actions')).sessionQuery,
  NoCompanyPage: () => null,
}))
vi.mock('@/features/onboarding', async () => ({
  onboardingDestination: (await import('@/features/onboarding/application/company-onboarding'))
    .onboardingDestination,
  companyOnboardingQuery: (id: string) => ({
    queryKey: ['company-onboarding', id],
    queryFn: onboardingStatus,
  }),
}))
vi.mock('@/app/app-frame', () => ({ AppFrame: () => null }))
vi.mock('@/app/technician-frame', () => ({ UserFrame: () => null }))
vi.mock('@/features/billing', () => ({
  SubscriptionAccessPage: () => null,
  tenantAccessQuery: (id: string) => ({ queryKey: ['tenant-access', id], queryFn: tenantAccess }),
}))
vi.mock('@/shared/store/store', () => ({
  hydrateStore,
  refreshStore: vi.fn(),
  setActiveTenantId: vi.fn(),
}))

describe('root session guard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    tenantAccess.mockResolvedValue(true)
    onboardingStatus.mockResolvedValue(null)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('allows the Google callback before a session exists', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    loadSession.mockResolvedValue(null)
    const beforeLoad = Route.options.beforeLoad
    if (!beforeLoad) throw new Error('Root session guard is missing')
    await expect(
      beforeLoad({
        context: { queryClient },
        location: { pathname: '/acceso-google', href: '/acceso-google?code=example' },
      } as Parameters<typeof beforeLoad>[0]),
    ).resolves.toEqual({ session: null, hasTenantAccess: false })
    queryClient.clear()
  })

  it('keeps the QR tag in the login fragment and allows the worker only after session and plan gates', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const beforeLoad = Route.options.beforeLoad
    if (!beforeLoad) throw new Error('Root session guard is missing')
    const hash = '12345678-1234-4234-8234-123456789abc'
    const visit = (token: string) =>
      beforeLoad({
        context: { queryClient },
        location: { pathname: '/equipo-qr', href: `/equipo-qr#${token}`, hash: token },
      } as Parameters<typeof beforeLoad>[0])
    loadSession.mockResolvedValue(null)
    await expect(visit(hash)).rejects.toMatchObject({
      options: { to: '/entrar', search: { redirect: '/equipo-qr' }, hash },
    })
    await expect(visit('invalid')).rejects.toMatchObject({
      options: { to: '/entrar', search: { redirect: '/equipo-qr' } },
    })
    const session = {
      userId: 'worker',
      email: '',
      fullName: '',
      tenantId: 'company',
      role: 'user',
      companies: [],
      needsWelcome: false,
    }
    loadSession.mockResolvedValue(session)
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
    await expect(visit(hash)).resolves.toEqual({ session, hasTenantAccess: true })
    expect(hydrateStore).not.toHaveBeenCalled()
    tenantAccess.mockResolvedValue(false)
    await queryClient.invalidateQueries({ queryKey: ['tenant-access', 'company'] })
    await expect(visit(hash)).rejects.toMatchObject({ options: { to: '/ajustes' } })
    queryClient.clear()
  })

  it('uses an already verified in-memory session offline, but never an invalidated one', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const beforeLoad = Route.options.beforeLoad
    if (!beforeLoad) throw new Error('Root session guard is missing')
    const visit = () =>
      beforeLoad({
        context: { queryClient },
        location: { pathname: '/', href: '/' },
      } as Parameters<typeof beforeLoad>[0])
    await expect(visit()).rejects.toThrow('Se necesita conexión')
    const session = {
      userId: 'user-1',
      email: '',
      fullName: '',
      tenantId: 'company-1',
      role: 'admin' as const,
      companies: [],
      needsWelcome: false,
    }
    queryClient.setQueryData(sessionQuery.queryKey, session)
    queryClient.setQueryData(['tenant-access', 'company-1'], true)
    queryClient.setQueryData(['company-onboarding', 'company-1'], null)
    hydrateStore.mockResolvedValue(undefined)
    await expect(visit()).resolves.toEqual({ session, hasTenantAccess: true })
    expect(loadSession).not.toHaveBeenCalled()
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey, refetchType: 'none' })
    await expect(visit()).rejects.toThrow('Se necesita conexión')
    queryClient.clear()
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

    await expect(visit('/entrar')).resolves.toEqual({ session: null, hasTenantAccess: false })
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
    expect(queryClient.getQueryData(sessionQuery.queryKey)).toBeNull()

    await expect(visit('/')).resolves.toEqual({ session, hasTenantAccess: true })
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

  it('allows workers to open settings without loading administrative data', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const beforeLoad = Route.options.beforeLoad
    if (!beforeLoad) throw new Error('Root session guard is missing')
    const session = {
      userId: 'worker-1',
      email: 'worker@example.test',
      fullName: 'Worker',
      tenantId: 'company-1',
      role: 'user',
      companies: [],
      needsWelcome: false,
    }
    loadSession.mockResolvedValue(session)
    const visit = (path: string) =>
      beforeLoad({
        context: { queryClient },
        location: { pathname: path, href: path },
      } as Parameters<typeof beforeLoad>[0])

    await expect(visit('/ajustes')).resolves.toEqual({ session, hasTenantAccess: true })
    await expect(visit('/trabajos')).rejects.toMatchObject({ options: { to: '/mi-jornada' } })
    expect(hydrateStore).not.toHaveBeenCalled()
    queryClient.clear()
  })

  it('sends unpaid companies to the payment page without loading business data', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const beforeLoad = Route.options.beforeLoad
    if (!beforeLoad) throw new Error('Root session guard is missing')
    const session = {
      userId: 'user-1',
      email: '',
      fullName: '',
      tenantId: 'company-1',
      role: 'admin',
      companies: [],
      needsWelcome: false,
    }
    loadSession.mockResolvedValue(session)
    tenantAccess.mockResolvedValue(false)
    const visit = (path: string) =>
      beforeLoad({
        context: { queryClient },
        location: { pathname: path, href: path },
      } as Parameters<typeof beforeLoad>[0])
    await expect(visit('/clientes')).rejects.toMatchObject({
      options: { to: '/ajustes', search: { tab: 'plan' } },
    })
    await expect(visit('/ajustes')).resolves.toEqual({ session, hasTenantAccess: false })
    expect(hydrateStore).not.toHaveBeenCalled()
    queryClient.clear()
  })

  it('blocks an unpaid worker from their assigned work while keeping the payment page accessible', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const beforeLoad = Route.options.beforeLoad
    if (!beforeLoad) throw new Error('Root session guard is missing')
    const session = {
      userId: 'worker-1',
      email: '',
      fullName: '',
      tenantId: 'company-1',
      role: 'user',
      companies: [],
      needsWelcome: false,
    }
    loadSession.mockResolvedValue(session)
    tenantAccess.mockResolvedValue(false)
    const visit = (path: string) =>
      beforeLoad({
        context: { queryClient },
        location: { pathname: path, href: path },
      } as Parameters<typeof beforeLoad>[0])
    await expect(visit('/mi-jornada')).rejects.toMatchObject({ options: { to: '/ajustes' } })
    await expect(visit('/ajustes')).resolves.toEqual({ session, hasTenantAccess: false })
    expect(hydrateStore).not.toHaveBeenCalled()
    queryClient.clear()
  })

  it('does not enter the workspace if subscription verification fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const beforeLoad = Route.options.beforeLoad
    if (!beforeLoad) throw new Error('Root session guard is missing')
    loadSession.mockResolvedValue({
      userId: 'user-1',
      email: '',
      fullName: '',
      tenantId: 'company-1',
      role: 'admin',
      companies: [],
      needsWelcome: false,
    })
    tenantAccess.mockRejectedValue(new Error('No se pudo comprobar la suscripción.'))
    await expect(
      beforeLoad({
        context: { queryClient },
        location: { pathname: '/', href: '/' },
      } as Parameters<typeof beforeLoad>[0]),
    ).rejects.toThrow('No se pudo comprobar la suscripción.')
    expect(hydrateStore).not.toHaveBeenCalled()
    queryClient.clear()
  })

  it('loads administrative data before completing a switch to an admin company', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const beforeLoad = Route.options.beforeLoad
    if (!beforeLoad) throw new Error('Root session guard is missing')
    const session = {
      userId: 'worker-1',
      email: 'worker@example.test',
      fullName: 'Worker',
      tenantId: 'company-2',
      role: 'admin',
      companies: [],
      needsWelcome: false,
    }
    loadSession.mockResolvedValue(session)
    let finishHydration: () => void = () => undefined
    hydrateStore.mockReturnValue(
      new Promise<void>((resolve) => {
        finishHydration = resolve
      }),
    )
    let loaded = false
    const visit = beforeLoad({
      context: { queryClient },
      location: { pathname: '/ajustes', href: '/ajustes' },
    } as Parameters<typeof beforeLoad>[0]).then(() => {
      loaded = true
    })

    await vi.waitFor(() => expect(hydrateStore).toHaveBeenCalledOnce())
    expect(loaded).toBe(false)
    finishHydration()
    await expect(visit).resolves.toBeUndefined()
    queryClient.clear()
  })
  it('keeps every role on onboarding until the paid booking is verified', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const beforeLoad = Route.options.beforeLoad
    if (!beforeLoad) throw new Error('Root session guard is missing')
    const visit = (pathname: string) =>
      beforeLoad({
        context: { queryClient },
        location: { pathname, href: pathname },
      } as Parameters<typeof beforeLoad>[0])
    loadSession.mockResolvedValue({ tenantId: 'company-1', role: 'user' })
    onboardingStatus.mockResolvedValue({ stage: 'booking' })
    await expect(visit('/mi-jornada')).rejects.toMatchObject({ options: { to: '/bienvenida' } })
    await expect(visit('/bienvenida')).resolves.toMatchObject({ hasTenantAccess: false })
    expect(tenantAccess).not.toHaveBeenCalled()
    expect(hydrateStore).not.toHaveBeenCalled()
    queryClient.clear()
  })
})
