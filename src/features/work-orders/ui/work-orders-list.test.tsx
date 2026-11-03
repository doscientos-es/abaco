import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { WorkOrder } from '../application/work-order-actions'
import { WorkOrdersList } from './work-orders-list'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    className,
  }: {
    children: ReactNode
    params: { workOrderId: string }
    className: string
  }) => (
    <a href={`/trabajos/${params.workOrderId}`} className={className}>
      {children}
    </a>
  ),
}))

const order: WorkOrder = {
  id: 'work-1',
  tenant_id: 'tenant-1',
  client_id: 'client-1',
  title: 'Revisión de climatización',
  description: '',
  kind: 'maintenance',
  status: 'scheduled',
  work_team_id: 'team-1',
  responsible_user_id: null,
  origin_estimate_id: null,
  location_id: null,
  asset_id: null,
  actual_start_at: null,
  actual_end_at: null,
  planned_start_at: '2026-11-03T09:00:00Z',
  planned_end_at: '2026-11-03T11:00:00Z',
  created_at: '2026-11-01T09:00:00Z',
  updated_at: '2026-11-01T09:00:00Z',
}

function render(overrides: Partial<WorkOrder> = {}, teamsLoading = false, teamsError = false) {
  return renderToStaticMarkup(
    <WorkOrdersList
      orders={[{ ...order, ...overrides }]}
      clients={new Map([['client-1', 'Instalaciones García']])}
      teams={new Map(teamsLoading || teamsError ? [] : [['team-1', 'Mantenimiento']])}
      teamsLoading={teamsLoading}
      teamsError={teamsError}
    />,
  )
}

describe('WorkOrdersList', () => {
  it('makes the whole work summary a single navigable link', () => {
    const html = render()
    expect(html.match(/<a /g)).toHaveLength(1)
    expect(html).toContain('href="/trabajos/work-1"')
    expect(html).toContain('Revisión de climatización')
    expect(html).toContain('Instalaciones García')
    expect(html).toContain('Programado')
    expect(html).toContain('Mantenimiento')
    expect(html).toContain('aria-label="Trabajos"')
  })

  it('retains both planned timestamps, including time of day', () => {
    const html = render()
    expect(html).toContain(`dateTime="${order.planned_start_at}"`)
    expect(html).toContain(`dateTime="${order.planned_end_at}"`)
    expect(html.match(/[0-9]{2}:[0-9]{2}/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('explicitly identifies missing assignments instead of showing blank cells', () => {
    const html = render({ work_team_id: null, planned_start_at: null, planned_end_at: null })
    expect(html).toContain('Sin equipo asignado')
    expect(html).toContain('Sin fecha de inicio')
    expect(html).not.toContain('<time')
  })

  it('distinguishes a loading team from a failed lookup', () => {
    expect(render({}, true)).toContain('Cargando equipo…')
    expect(render({}, false, true)).toContain('Error al cargar equipo')
    expect(render({ work_team_id: 'missing-team' })).toContain('Equipo no disponible')
  })

  it.each([
    ['ready', 'Pendiente de preparar'],
    ['in_progress', 'En curso'],
    ['completed', 'Completado'],
    ['canceled', 'Cancelado'],
  ] as const)('keeps status %s understandable without relying on color', (status, label) => {
    expect(render({ status })).toContain(label)
  })

  it('escapes customer content and clearly identifies missing customers', () => {
    const html = render({ title: '<script>alert(1)</script>', client_id: 'missing-client' })
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Cliente no disponible')
  })
})
