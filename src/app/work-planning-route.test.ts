import { Outlet } from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'

import { parseWorkSearch, WorkOrdersPage } from '@/features/work-orders'
import { Route as AgendaRoute } from '@/routes/agenda'
import { Route as ContractsRoute } from '@/routes/contratos'
import { Route as ContractDetailRoute } from '@/routes/contratos.$contractId'
import { Route as ContractsIndexRoute } from '@/routes/contratos.index'
import { Route as WorkRoute } from '@/routes/trabajos'
import { Route as WorkIndexRoute } from '@/routes/trabajos.index'

vi.mock('@/features/auth', () => ({ requirePermission: () => () => undefined }))
vi.mock('@/features/work-orders', async () => ({
  ...(await import('../features/work-orders/domain/work-search')),
  WorkOrdersPage: () => null,
}))
vi.mock('@/features/contracts', () => ({
  ContractsPage: () => null,
  ContractDetailPage: () => null,
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

  it('keeps contract details separate from the contract index', () => {
    expect(ContractsRoute.options.component).toBe(Outlet)
    expect(ContractsIndexRoute.options.component).not.toBe(Outlet)
    expect(ContractDetailRoute.options.component).toBeDefined()
    const validate = ContractsIndexRoute.options.validateSearch
    if (typeof validate !== 'function') throw new Error('Missing contracts search validator')
    expect(validate({ tab: 'trabajos' })).toEqual({ tab: 'trabajos' })
    expect(validate({ tab: 'other' })).toEqual({})
  })

  it('redirects old contracted work links to their new home without affecting planning', () => {
    const loader = WorkIndexRoute.options.loader as (context: { deps: { tab?: string } }) => void
    expect(() => loader({ deps: { tab: 'planificacion' } })).not.toThrow()
    try {
      loader({ deps: { tab: 'contratados' } })
      expect.unreachable('Expected contracted jobs to redirect')
    } catch (error) {
      expect(error).toMatchObject({
        options: { to: '/contratos', search: { tab: 'trabajos' }, replace: true },
      })
    }
  })
})
