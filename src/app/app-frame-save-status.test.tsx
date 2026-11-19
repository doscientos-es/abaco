import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { SaveStatus } from '@/shared/store/store'

const state = vi.hoisted(() => ({
  pathname: '/',
  saveStatus: { state: 'saved' } as SaveStatus,
  canManageVacations: true,
  canReadInvoices: true,
  canEditSettings: true,
  canReadWork: true,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
  useRouterState: () => state.pathname,
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: () => ({ data: false }),
}))
vi.mock('@/features/auth', () => ({
  can: (_role: string, permission: string) =>
    permission === 'vacations:manage'
      ? state.canManageVacations
      : permission === 'invoices:read'
        ? state.canReadInvoices
        : permission === 'settings:write'
          ? state.canEditSettings
          : permission === 'work:read'
            ? state.canReadWork
            : true,
  CompanyDialog: () => null,
  roleLabels: { admin: 'Administrador' },
  useCompanyActions: () => ({ switchTo: vi.fn() }),
  useSession: () => ({
    role: 'admin',
    fullName: 'Ana',
    tenantId: 'company',
    userId: 'user',
    companies: [],
  }),
  useSignOut: () => vi.fn(),
}))
vi.mock('@/features/billing', () => ({ PlanBanner: () => null }))
vi.mock('@/features/global-search', () => ({ GlobalSearch: () => <span>Búsqueda global</span> }))
vi.mock('@/features/invoices', () => ({
  ContractInvoiceNotifications: () => <span>Avisos de facturas</span>,
}))
vi.mock('@/features/product-modules', () => ({
  useModuleEnabled: () => false,
  useStaffModule: () => true,
}))
vi.mock('@/features/superadmin', () => ({ platformAccessQuery: () => ({}) }))
vi.mock('@/features/vacations', () => ({ PendingAbsenceNotifications: () => <span>Avisos</span> }))
vi.mock('@/shared/store/store', () => ({
  retryStoreSaves: vi.fn(),
  useSaveStatus: () => state.saveStatus,
  useTenantData: () => ({ tenant: { id: 'company', name: 'Empresa' } }),
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
    const general = html.slice(html.indexOf('>General<'), html.indexOf('>Ventas<'))
    const sales = html.slice(html.indexOf('>Ventas<'), html.indexOf('>Operaciones<'))
    const operations = html.slice(html.indexOf('>Operaciones<'), html.indexOf('>Finanzas<'))
    expect(sales).toContain('href="/contratos"')
    expect(general).toContain('href="/horarios"')
    expect(operations).not.toContain('href="/horarios"')
    expect(html).not.toContain('href="/vacaciones"')
  })

  it('offers the main modules in a mobile bar and honors work permissions', () => {
    const html = renderToStaticMarkup(<AppFrame>Contenido</AppFrame>)
    const mobile = html.slice(html.indexOf('aria-label="Navegación móvil"'))
    expect(mobile).toContain('class="mobile-bottom-nav"')
    for (const path of ['/presupuestos', '/clientes', '/trabajos']) {
      expect(mobile).toContain(`href="${path}"`)
    }
    expect(mobile).toContain('>Buscar</span>')
    expect(mobile.match(/<a /g)).toHaveLength(4)
    state.canReadWork = false
    try {
      const restricted = renderToStaticMarkup(<AppFrame>Contenido</AppFrame>)
      expect(restricted).not.toContain('href="/trabajos"')
    } finally {
      state.canReadWork = true
    }
  })

  it('applies stored mobile shortcuts and desktop order without reviving restricted links', () => {
    const getItem = vi.fn((key: string) =>
      key === 'abaco:interface:v1:company:user'
        ? JSON.stringify({
            mobile: ['/facturas', '/trabajos', '/clientes', '/personalizar'],
            desktopGroups: ['finance', 'sales'],
            desktopItems: ['/contabilidad', '/facturas'],
          })
        : null,
    )
    vi.stubGlobal('window', { localStorage: { getItem } })
    state.canReadWork = false
    try {
      const html = renderToStaticMarkup(<AppFrame>Contenido</AppFrame>)
      const desktop = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'))
      const mobile = html.slice(html.indexOf('aria-label="Navegación móvil"'))

      expect(getItem).toHaveBeenCalledWith('abaco:interface:v1:company:user')
      expect(desktop.indexOf('>Finanzas<')).toBeLessThan(desktop.indexOf('>Ventas<'))
      expect(desktop.indexOf('>Contabilidad</a>')).toBeLessThan(desktop.indexOf('>Facturas</a>'))
      expect([...mobile.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual([
        '/facturas',
        '/clientes',
        '/personalizar',
        '/',
      ])
    } finally {
      state.canReadWork = true
      vi.unstubAllGlobals()
    }
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
    state.canReadInvoices = false
    state.canEditSettings = false
    try {
      const html = renderToStaticMarkup(<AppFrame>Contenido</AppFrame>)
      expect(html).not.toContain('aria-label="Ajustes"')
      expect(html).not.toContain('Avisos')
    } finally {
      state.canManageVacations = true
      state.canReadInvoices = true
      state.canEditSettings = true
    }
  })

  it('mantiene Guardado en la barra lateral, pero solo muestra el progreso en la cabecera móvil', () => {
    const render = () => renderToStaticMarkup(<AppFrame>Contenido de la página</AppFrame>)
    const header = (html: string) => html.slice(html.indexOf('<header'), html.indexOf('</header>'))
    const idle = render()
    expect(idle.slice(0, idle.indexOf('<header'))).toContain('>Guardado</span>')
    expect(header(idle)).not.toContain('>Guardado</span>')
    state.saveStatus = { state: 'saving' }
    try {
      expect(header(render())).toContain('>Guardando…</span>')
    } finally {
      state.saveStatus = { state: 'saved' }
    }
  })
})
