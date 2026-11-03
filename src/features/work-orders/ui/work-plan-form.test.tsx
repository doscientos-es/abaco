import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkOrder } from '../application/work-order-actions'
import { WorkPlanForm } from './work-plan-form'

const lookup = vi.hoisted(() => ({ pending: false, failed: false }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    isSuccess: !lookup.pending && !lookup.failed,
    isError: lookup.failed,
    data: [],
    error: lookup.failed ? new Error('Sin conexión') : null,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/features/auth', () => ({ can: () => false, useSession: () => null }))
vi.mock('@/features/work-teams', () => ({
  workTeamsQuery: () => ({ queryKey: ['work-teams'] }),
  assignableWorkTeams: () => [],
  workTeamLabel: () => '',
}))
vi.mock('../application/work-order-actions', () => ({
  loadWorkMemberOptions: vi.fn(),
  updateWorkOrderPlan: vi.fn(),
}))
vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    Card: Container,
    CardContent: Container,
    CardHeader: Container,
    CardTitle: Container,
    CardDescription: Container,
    Button: ({
      children,
      isDisabled,
      type,
    }: {
      children: ReactNode
      isDisabled?: boolean
      type?: 'button' | 'submit'
    }) => (
      <button disabled={isDisabled} type={type ?? 'button'}>
        {children}
      </button>
    ),
    toast: { success: vi.fn() },
  }
})
vi.mock('@/shared/ui/form', () => ({
  SelectField: ({ label, isDisabled }: { label: string; isDisabled: boolean }) => (
    <select aria-label={label} disabled={isDisabled} />
  ),
  TextField: ({ label, value, min }: { label: string; value: string; min?: string }) => (
    <input aria-label={label} defaultValue={value} min={min} />
  ),
  TextareaField: ({ label, value }: { label: string; value: string }) => (
    <textarea aria-label={label} defaultValue={value} />
  ),
}))

const order: WorkOrder = {
  id: 'work-1',
  tenant_id: 'tenant-1',
  client_id: 'client-1',
  title: 'Mantenimiento',
  description: 'Llevar herramientas',
  kind: 'maintenance',
  status: 'ready',
  work_team_id: null,
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
const render = (overrides: Partial<WorkOrder> = {}) =>
  renderToStaticMarkup(
    <WorkPlanForm tenantId="tenant-1" order={{ ...order, ...overrides }} onSaved={vi.fn()} />,
  )

describe('WorkPlanForm feedback', () => {
  beforeEach(() => {
    lookup.pending = false
    lookup.failed = false
  })

  it('does not offer to save an unchanged plan and retains operational notes', () => {
    const html = render()
    expect(html).toContain('Sin cambios pendientes')
    expect(html).toContain('<button disabled="" type="submit">Guardar planificación</button>')
    expect(html).toContain('Llevar herramientas')
    expect(html).not.toContain('Restablecer')
  })

  it('explains reversed dates inline before attempting a save', () => {
    const html = render({ planned_end_at: '2026-11-03T08:00:00Z' })
    expect(html).toContain('role="alert"')
    expect(html).toContain('El fin previsto no puede ser anterior al inicio.')
    expect(html).toContain('<button disabled="" type="submit">')
    expect(html).toMatch(/min="[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}"/)
  })

  it('disables assignment controls and explains pending lookups', () => {
    lookup.pending = true
    const html = render()
    expect(html).toContain('Cargando personas y equipos…')
    expect(html).toContain('<select aria-label="Responsable" disabled=""')
    expect(html).toContain('<select aria-label="Equipo de trabajo" disabled=""')
  })

  it('offers separate retries for failed people and team lookups', () => {
    lookup.failed = true
    const html = render()
    expect(html).toContain('Reintentar personas')
    expect(html).toContain('Reintentar equipos')
    expect(html).toContain('Sin conexión')
    expect(html).toContain('<select aria-label="Responsable" disabled=""')
    expect(html).not.toContain('Cargando personas y equipos…')
  })
})
