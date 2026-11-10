import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
  useRouterState: () => '/',
}))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: false }) }))
vi.mock('@/features/auth', () => ({
  can: () => true,
  CompanyDialog: () => null,
  roleLabels: { admin: 'Administrador' },
  useCompanyActions: () => ({ switchTo: vi.fn() }),
  useSession: () => ({ role: 'admin', fullName: 'Ana', companies: [] }),
  useSignOut: () => vi.fn(),
}))
vi.mock('@/features/billing', () => ({ PlanBanner: () => null }))
vi.mock('@/features/superadmin', () => ({ platformAccessQuery: () => ({}) }))
vi.mock('@/shared/store/store', () => ({
  retryStoreSaves: vi.fn(),
  useSaveStatus: () => ({ state: 'saved' }),
  useTenantData: () => ({ tenant: { name: 'Empresa' } }),
}))

import { AppFrame } from './app-frame'

describe('estado de guardado en la aplicación', () => {
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
