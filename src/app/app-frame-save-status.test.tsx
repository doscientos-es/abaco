import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  pathname: '/',
  canManageVacations: true,
  canEditSettings: true,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
  useRouterState: () => state.pathname,
}))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: false }) }))
vi.mock('@/features/auth', () => ({
  can: (_role: string, permission: string) =>
    permission === 'vacations:manage'
      ? state.canManageVacations
      : permission === 'settings:write'
        ? state.canEditSettings
        : true,
  CompanyDialog: () => null,
  roleLabels: { admin: 'Administrador' },
  useCompanyActions: () => ({ switchTo: vi.fn() }),
  useSession: () => ({ role: 'admin', fullName: 'Ana', tenantId: 'company', companies: [] }),
  useSignOut: () => vi.fn(),
}))
vi.mock('@/features/billing', () => ({ PlanBanner: () => null }))
vi.mock('@/features/global-search', () => ({ GlobalSearch: () => <span>Búsqueda global</span> }))
vi.mock('@/features/superadmin', () => ({ platformAccessQuery: () => ({}) }))
vi.mock('@/features/vacations', () => ({ PendingAbsenceNotifications: () => <span>Avisos</span> }))
vi.mock('@/shared/store/store', () => ({
  retryStoreSaves: vi.fn(),
  useSaveStatus: () => ({ state: 'saved' }),
  useTenantData: () => ({ tenant: { name: 'Empresa' } }),
}))

import { AppFrame } from './app-frame'

describe('estado de guardado en la aplicación', () => {
  it('shows the company and section trail only on internal pages', () => {
    try {
      for (const pathname of ['/', '/presupuestos', '/presupuestos/', '/clientes', '/ajustes']) {
        state.pathname = pathname
        const html = renderToStaticMarkup(<AppFrame>Contenido</AppFrame>)
        const topbar = html.slice(
          html.indexOf('workspace-topbar__identity'),
          html.indexOf('Búsqueda global'),
        )
        expect(topbar).not.toContain('Empresa')
        expect(topbar).toContain('workspace-topbar__heading')
      }

      for (const pathname of ['/presupuestos/123', '/clientes/123/editar']) {
        state.pathname = pathname
        const html = renderToStaticMarkup(<AppFrame>Contenido</AppFrame>)
        const topbar = html.slice(
          html.indexOf('workspace-topbar__identity'),
          html.indexOf('Búsqueda global'),
        )
        expect(topbar).toContain('Empresa')
        expect(topbar).toContain('Ventas')
      }
    } finally {
      state.pathname = '/'
    }
  })

  it('expands workers and vacation management to the available width', () => {
    state.pathname = '/vacaciones'
    const wide = renderToStaticMarkup(<AppFrame>Vacaciones</AppFrame>)
    expect(wide).toContain('data-size="full"')
    expect(wide).toContain('max-w-none')
    state.pathname = '/trabajadores'
    expect(renderToStaticMarkup(<AppFrame>Trabajadores</AppFrame>)).toContain('data-size="full"')
    state.pathname = '/'
    const standard = renderToStaticMarkup(<AppFrame>Resumen</AppFrame>)
    expect(standard).toContain('data-size="wide"')
    expect(standard).toContain('max-w-6xl')
  })
  it('scopes the compact office layout to the admin shell', () => {
    const html = renderToStaticMarkup(<AppFrame>Contenido</AppFrame>)
    expect(html).toContain('admin-frame')
    expect(html).toContain('md:px-6')
    expect(html).toContain('md:py-6')
  })
  it('offers one operations destination for both work views, on desktop and mobile', () => {
    const html = renderToStaticMarkup(<AppFrame>Contenido de la página</AppFrame>)
    expect(html).toContain('href="/trabajos"')
    expect(html.indexOf('>Contratos</a>')).toBeLessThan(html.indexOf('>Planificación</a>'))
    expect(html).not.toContain('href="/agenda"')
    expect(html).not.toContain('>Agenda<')
    expect(html).toContain('href="/trabajadores"')
    const sales = html.slice(html.indexOf('>Ventas<'), html.indexOf('>Operaciones<'))
    expect(sales).toContain('href="/contratos"')
    expect(html).not.toContain('href="/horarios"')
    expect(html).not.toContain('href="/vacaciones"')
  })

  it('places settings in the sidebar footer instead of the main navigation', () => {
    const html = renderToStaticMarkup(<AppFrame>Contenido</AppFrame>)
    const sidebarNav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'))
    const footer = html.slice(html.indexOf('</nav>'), html.indexOf('data-slot="app-shell-main"'))
    expect(sidebarNav).not.toContain('href="/ajustes"')
    expect(footer).toContain('aria-label="Ajustes"')
    expect(footer).toContain('Avisos')
    expect(footer.indexOf('>Guardado</span>')).toBeLessThan(footer.indexOf('aria-label="Ajustes"'))
  })

  it('hides the footer actions when the user lacks their permissions', () => {
    state.canManageVacations = false
    state.canEditSettings = false
    try {
      const html = renderToStaticMarkup(<AppFrame>Contenido</AppFrame>)
      expect(html).not.toContain('aria-label="Ajustes"')
      expect(html).not.toContain('Avisos')
    } finally {
      state.canManageVacations = true
      state.canEditSettings = true
    }
  })

  it('lo sitúa en la barra lateral y la cabecera móvil, fuera del contenido', () => {
    const html = renderToStaticMarkup(<AppFrame>Contenido de la página</AppFrame>)
    const main = html.indexOf('data-slot="app-shell-main"')
    const mobileHeader = html.indexOf('data-slot="app-shell-mobile-header"')
    const content = html.indexOf('Contenido de la página')
    const firstStatus = html.indexOf('>Guardado</span>')
    const secondStatus = html.indexOf('>Guardado</span>', firstStatus + 1)
    expect(firstStatus).toBeGreaterThan(-1)
    expect(firstStatus).toBeLessThan(main)
    expect(secondStatus).toBeGreaterThan(mobileHeader)
    expect(secondStatus).toBeLessThan(content)
    expect(html.indexOf('>Guardado</span>', secondStatus + 1)).toBe(-1)
  })
})
