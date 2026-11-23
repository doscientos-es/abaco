import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkOrder } from '../application/work-order-actions'
import { WorkDaysPlanner } from './work-days-planner'

const state = vi.hoisted(() => ({ failed: false }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (state.failed && queryKey[0] === 'work-days')
      return { isPending: false, isError: true, data: undefined, refetch: vi.fn() }
    const data =
      queryKey[0] === 'work-days'
        ? [
            {
              id: '1',
              status: 'scheduled',
              scheduled_start_at: '2026-11-03T08:00:00Z',
              updated_at: '1',
              service_locations: null,
            },
            {
              id: '2',
              status: 'completed',
              scheduled_start_at: '2026-11-06T08:00:00Z',
              updated_at: '2',
              service_locations: null,
            },
          ]
        : queryKey[0] === 'work-target-options'
          ? { locations: [] }
          : []
    return { isPending: false, isError: false, data, refetch: vi.fn() }
  },
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/trabajos">{children}</a>,
}))
vi.mock('@doscientos/ui', () => {
  const Container = ({ children, id }: { children: ReactNode; id?: string }) => (
    <div id={id}>{children}</div>
  )
  return {
    Card: Container,
    CardContent: Container,
    CardHeader: Container,
    CardTitle: Container,
    CardDescription: Container,
    Button: ({ children, isDisabled }: { children: ReactNode; isDisabled?: boolean }) => (
      <button disabled={isDisabled}>{children}</button>
    ),
    toast: { success: vi.fn() },
  }
})

const order = { id: 'work', client_id: 'client', location_id: null, status: 'ready' } as WorkOrder

describe('WorkDaysPlanner', () => {
  beforeEach(() => {
    state.failed = false
  })

  it('shows saved non-consecutive days and protects finished visits', () => {
    const html = renderToStaticMarkup(<WorkDaysPlanner tenantId="tenant" order={order} />)
    expect(html).toContain('Planear trabajo')
    expect(html).toContain('Días seleccionados: 2026-11-03, 2026-11-06')
    expect(html).toContain('Los días con visitas iniciadas, finalizadas u omitidas')
    expect(html).toContain('Guardar días')
    expect(html).toContain('Ver agenda de trabajos')
  })

  it('shows a retry instead of an empty calendar when the visit query fails', () => {
    state.failed = true
    const html = renderToStaticMarkup(<WorkDaysPlanner tenantId="tenant" order={order} />)
    expect(html).toContain('No se pudo cargar la planificación')
    expect(html).toContain('Reintentar')
    expect(html).not.toContain('Todavía no hay días seleccionados')
  })
})
