import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { sessionQuery } from '@/features/auth/application/auth-actions'
import { Route } from '@/routes/ajustes'

vi.mock('@/features/auth', async () => ({
  can: (await import('@/features/auth/domain/permissions')).can,
  requirePermission: (await import('@/features/auth/application/guards')).requirePermission,
  sessionQuery: (await import('@/features/auth/application/auth-actions')).sessionQuery,
}))
vi.mock('@/features/settings', () => ({ SettingsPage: () => null, UserSettingsPage: () => null }))

function validate(search: Record<string, unknown>) {
  const validator = Route.options.validateSearch
  if (typeof validator !== 'function') throw new Error('Missing settings search validator')
  return validator(search)
}

describe('settings route search', () => {
  it('supports direct links to the news tab', () => {
    expect(validate({ tab: 'novedades' })).toEqual({ tab: 'novedades' })
  })

  it('supports direct links to the plan tab', () => {
    expect(validate({ tab: 'plan' })).toEqual({ tab: 'plan' })
  })

  it('supports direct links to configurable lists', () => {
    expect(validate({ tab: 'listas' })).toEqual({ tab: 'listas' })
  })

  it('rejects unknown tabs', () => {
    expect(validate({ tab: 'unknown' })).toEqual({})
  })

  it('keeps the payment return focused on billing', () => {
    expect(validate({ pago: 'ok' })).toEqual({ tab: 'plan', pago: 'ok' })
    expect(validate({ tab: 'novedades', pago: 'ok' })).toEqual({ tab: 'novedades', pago: 'ok' })
  })
})

describe('legacy settings links', () => {
  const session = (role: 'admin' | 'user') => ({
    userId: 'user-1',
    email: 'user@example.test',
    fullName: 'Usuario',
    tenantId: 'company-1',
    role,
    companies: [],
    needsWelcome: false,
  })

  it.each(['documentos', 'listas'] as const)(
    'redirects admin links to the %s personalization section',
    async (tab) => {
      const queryClient = new QueryClient()
      queryClient.setQueryData(sessionQuery.queryKey, session('admin'))
      const beforeLoad = Route.options.beforeLoad
      if (!beforeLoad) throw new Error('Missing settings route guard')
      await expect(
        beforeLoad({ context: { queryClient }, search: { tab } } as Parameters<
          typeof beforeLoad
        >[0]),
      ).rejects.toMatchObject({ options: { to: '/personalizar', search: { tab }, replace: true } })
      queryClient.clear()
    },
  )

  it('keeps a worker on their personal settings instead of redirecting to an admin page', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(sessionQuery.queryKey, session('user'))
    const beforeLoad = Route.options.beforeLoad
    if (!beforeLoad) throw new Error('Missing settings route guard')
    await expect(
      beforeLoad({ context: { queryClient }, search: { tab: 'listas' } } as Parameters<
        typeof beforeLoad
      >[0]),
    ).resolves.toBeUndefined()
    queryClient.clear()
  })
})
