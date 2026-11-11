import { Outlet } from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'

import { parseWorkSearch, WorkOrdersPage } from '@/features/work-orders'
import { Route as AgendaRoute } from '@/routes/agenda'
import { Route as WorkRoute } from '@/routes/trabajos'
import { Route as WorkIndexRoute } from '@/routes/trabajos.index'

vi.mock('@/features/auth', () => ({ requirePermission: () => () => undefined }))
vi.mock('@/features/work-orders', async () => ({
  ...(await import('../features/work-orders/domain/work-search')),
  WorkOrdersPage: () => null,
}))

describe('unified work routes', () => {
  it('redirects old agenda links with their dates, views and filters intact', () => {
    const loader = AgendaRoute.options.loader as (context: {
      deps: ReturnType<typeof parseWorkSearch>
    }) => never
    for (const view of [undefined, 'list', 'calendar'] as const) {
      const deps = parseWorkSearch({
        view,
        date: '2026-11-13',
        period: 'week',
        team: 'unassigned',
        status: 'scheduled',
      })
      try {
        loader({ deps })
        expect.unreachable('Expected the old agenda to redirect')
      } catch (error) {
        expect(error).toMatchObject({
          options: {
            to: '/trabajos',
            replace: true,
            search: { ...deps, view: view ?? 'calendar' },
          },
        })
      }
    }
  })

  it('keeps work details reachable instead of rendering the planning list over them', () => {
    expect(WorkRoute.options.component).toBe(Outlet)
    expect(WorkIndexRoute.options.component).toBe(WorkOrdersPage)
    expect(WorkRoute.options.validateSearch).toBe(parseWorkSearch)
  })
})
