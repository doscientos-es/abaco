import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardPage } from './dashboard-page'

const mocks = vi.hoisted(() => ({ role: 'admin' }))

vi.mock('@/features/auth', () => ({
  useSession: () => ({ role: mocks.role }),
  can: (role: string) => role === 'admin',
}))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({
    estimates: [],
    ledger: [],
    clients: [],
    invoices: [],
    tenant: { name: 'Empresa', dashboardConfig: { version: 1, widgets: [] } },
  }),
  useSaveStatus: () => 'idle',
  updateTenantData: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/presupuestos">{children}</a>,
}))

describe('dashboard customization', () => {
  beforeEach(() => {
    mocks.role = 'admin'
  })

  it('offers an accessible icon-only customization action', () => {
    const html = renderToStaticMarkup(<DashboardPage />)
    expect(html).toMatch(/<button[^>]*aria-label="Personalizar resumen"[^>]*>/)
    expect(html).toContain('data-slot="icon-button"')
  })

  it('hides customization for people without permission', () => {
    mocks.role = 'user'
    const html = renderToStaticMarkup(<DashboardPage />)
    expect(html).not.toContain('aria-label="Personalizar resumen"')
    expect(html).not.toContain('Personalizar resumen</button>')
  })
})
