import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { sessionQuery } from '@/features/auth/application/auth-actions'
import type { AuthSession } from '@/features/auth/infrastructure/load-session'
import { Route as SchedulesRoute } from '@/routes/horarios'
import { Route as WorkersRoute } from '@/routes/trabajadores'
import { Route as VacationsRoute } from '@/routes/vacaciones'

vi.mock('@/features/auth', async () => ({
  requirePermission: (await import('@/features/auth/application/guards')).requirePermission,
}))
vi.mock('@/features/workers', async () => ({
  WorkersPage: () => null,
  validateWorkersSearch: (await import('@/features/workers/domain/worker-navigation'))
    .validateWorkersSearch,
}))
vi.mock('@/features/staff-schedules', () => ({ StaffSchedulesPage: () => null }))

describe('workers access and legacy links', () => {
  it.each(['admin', 'user'] as const)('enforces administrative access for %s', async (role) => {
    const cache = new QueryClient()
    const session: AuthSession = {
      userId: 'person',
      tenantId: 'company',
      email: 'person@example.com',
      fullName: 'Persona',
      companies: [],
      role,
      needsWelcome: false,
    }
    cache.setQueryData(sessionQuery.queryKey, session)
    const guard = WorkersRoute.options.beforeLoad
    if (!guard) throw new Error('Missing workers guard')
    const visit = Reflect.apply(guard, undefined, [{ context: { queryClient: cache } }])
    if (role === 'admin') await expect(visit).resolves.toBeUndefined()
    else await expect(visit).rejects.toMatchObject({ options: { to: '/', replace: true } })
    cache.clear()
  })

  it('redirects old vacation links to the workers absence section', () => {
    const loader = VacationsRoute.options.loader
    if (typeof loader !== 'function') throw new Error('Missing vacation redirect')
    try {
      Reflect.apply(loader, undefined, [{}])
      expect.unreachable('The old vacation route must redirect')
    } catch (error) {
      expect(error).toMatchObject({
        options: { to: '/trabajadores', search: { vista: 'vacaciones' }, replace: true },
      })
    }
  })

  it('redirects admin schedules while preserving workers own schedule route', () => {
    const loader = SchedulesRoute.options.loader
    if (typeof loader !== 'function') throw new Error('Missing schedule redirect')
    expect(
      loader({ context: { session: { role: 'user' } } } as Parameters<typeof loader>[0]),
    ).toBeUndefined()
    try {
      loader({ context: { session: { role: 'admin' } } } as Parameters<typeof loader>[0])
      expect.unreachable('Administrative schedules must redirect')
    } catch (error) {
      expect(error).toMatchObject({
        options: { to: '/trabajadores', search: { vista: 'horarios' }, replace: true },
      })
    }
  })
})
