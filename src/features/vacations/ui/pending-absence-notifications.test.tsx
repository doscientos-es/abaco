import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PendingAbsenceNotifications } from './pending-absence-notifications'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQuery: query }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('@doscientos/ui', () => ({
  IconButton: ({ children, label }: { children: ReactNode; label: string }) => (
    <button aria-label={label}>{children}</button>
  ),
  Popover: ({ children, trigger }: { children: ReactNode; trigger: ReactNode }) => (
    <div>
      {trigger}
      {children}
    </div>
  ),
}))
vi.mock('../application/vacation-actions', () => ({ listVacationRequests: vi.fn() }))

describe('PendingAbsenceNotifications', () => {
  beforeEach(() => query.mockReset())

  it('shows pending requests, ignoring other statuses, and links to their management', () => {
    query.mockReturnValue({
      data: [{ status: 'pending' }, { status: 'approved' }, { status: 'pending' }],
    })
    const html = renderToStaticMarkup(<PendingAbsenceNotifications tenantId="company" />)
    expect(query.mock.calls[0]?.[0].queryKey).toEqual(['vacation-requests', 'company'])
    expect(html).toContain('Notificaciones: 2 solicitudes pendientes')
    expect(html).toContain('2 solicitudes de ausencia pendientes')
    expect(html).toContain('href="/vacaciones"')
  })

  it('shows a truthful empty state when nothing is pending', () => {
    query.mockReturnValue({ data: [{ status: 'approved' }] })
    const html = renderToStaticMarkup(<PendingAbsenceNotifications tenantId="company" />)
    expect(html).toContain('No hay solicitudes de ausencia pendientes')
    expect(html).toContain('aria-label="Notificaciones"')
  })

  it('reports failures instead of suggesting that there are no notifications', () => {
    query.mockReturnValue({ isError: true })
    const html = renderToStaticMarkup(<PendingAbsenceNotifications tenantId="company" />)
    expect(html).toContain('No se pudieron cargar las solicitudes de ausencia')
    expect(html).not.toContain('No hay solicitudes de ausencia pendientes')
  })
})
