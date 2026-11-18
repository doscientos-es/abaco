import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlatformSearch } from '../domain/platform-navigation'
import { SuperadminPage } from './superadmin-page'

const tenantId = '37b30000-0000-0000-0000-000000000001'
const company = {
  id: tenantId,
  name: 'Empresa de prueba',
  plan: 'team',
  subscription_status: 'active',
  member_count: 3,
  current_period_end: null,
  billing_interval: 'year',
  is_complimentary: false,
}
const state = vi.hoisted(() => ({
  allowed: false,
  queries: [] as unknown[][],
  role: null as 'user' | 'admin' | null,
  missingCompany: false,
  pendingPayment: false,
}))
vi.mock('@/features/auth', () => ({
  useSession: () => ({
    userId: 'platform-user',
    role: state.role,
    tenantId: state.role ? 'active-company' : null,
    companies: state.role
      ? [
          { id: 'other-company', name: 'Otra empresa' },
          { id: 'active-company', name: 'Empresa activa' },
        ]
      : [],
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    'aria-current': current,
  }: {
    children: React.ReactNode
    to: string
    search?: PlatformSearch
    'aria-current'?: 'page'
  }) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(search ?? {})) {
      if (value !== undefined) params.set(key, String(value))
    }
    return (
      <a href={params.size ? `${to}?${params}` : to} aria-current={current}>
        {children}
      </a>
    )
  },
  useNavigate: () => vi.fn(),
}))
vi.mock('./company-billing-agreement', () => ({
  CompanyBillingAgreement: () => <p>Condiciones de facturación</p>,
}))
vi.mock('@/features/product-modules', () => ({
  ModuleSubscriptions: ({ blocked }: { blocked: boolean }) => (
    <p>{blocked ? 'Cambios bloqueados' : 'Módulos opcionales'}</p>
  ),
}))
vi.mock('@tanstack/react-query', () => ({
  queryOptions: <T,>(options: T) => options,
  useQueryClient: () => ({}),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    state.queries.push(queryKey)
    if (queryKey[0] === 'platform-access') return { data: state.allowed }
    if (queryKey[0] === 'platform-companies') return { data: [company] }
    if (queryKey[0] === 'platform-company') return { data: state.missingCompany ? null : company }
    if (queryKey[0] === 'billing-preview') return { data: { pending: state.pendingPayment } }
    if (queryKey[0] === 'platform-payment-summary') {
      return {
        data: { succeeded_count: 1, succeeded_cents: 3400, failed_count: 0, pending_count: 0 },
      }
    }
    if (queryKey[0] === 'platform-payments') {
      return {
        data: [
          {
            id: 'payment',
            kind: 'renewal',
            plan: 'team',
            period: 'year',
            amount_cents: 3400,
            status: 'succeeded',
            created_at: '2030-07-15T12:00:00Z',
            invoice_number: 'PRUEBA-001',
            invoice_status: 'sent',
          },
        ],
      }
    }
    throw new Error('Unexpected query')
  },
}))

describe('platform administration navigation', () => {
  beforeEach(() => {
    state.allowed = false
    state.queries = []
    state.role = null
    state.missingCompany = false
    state.pendingPayment = false
  })

  it('does not request company data even with a direct link when the user lacks platform access', () => {
    const html = renderToStaticMarkup(
      <SuperadminPage search={{ empresa: tenantId, seccion: 'pagos' }} />,
    )
    expect(html).toContain('No tienes acceso')
    expect(state.queries).toEqual([['platform-access', 'platform-user']])
  })

  it('queries the chosen directory page and carries it into the company link', () => {
    state.allowed = true
    const html = renderToStaticMarkup(<SuperadminPage search={{ q: 'prueba', page: 3 }} />)
    expect(html).toContain('Empresa de prueba')
    expect(html).toContain('3 personas')
    expect(html).toContain(`?q=prueba&amp;page=3&amp;empresa=${tenantId}`)
    expect(state.queries).toEqual([
      ['platform-access', 'platform-user'],
      ['platform-companies', 'prueba', 100],
    ])
  })

  it('loads a direct payment link by company ID and preserves the return to the directory', () => {
    state.allowed = true
    const html = renderToStaticMarkup(
      <SuperadminPage search={{ q: 'prueba', page: 3, empresa: tenantId, seccion: 'pagos' }} />,
    )

    expect(html).toContain('Factura PRUEBA-001')
    expect(html).toContain('Correo aceptado por el proveedor')
    expect(html).toContain(`empresa=${tenantId}&amp;seccion=pagos" aria-current="page"`)
    expect(html).toMatch(/href="\/superadmin\?q=prueba&amp;page=3">[^<]*</)
    expect(state.queries).toEqual([
      ['platform-access', 'platform-user'],
      ['platform-company', tenantId],
      ['platform-payments', tenantId, 0, ''],
      ['platform-payment-summary', tenantId],
    ])
  })

  it('keeps commercial and payment views unmounted in modules and preserves the billing block', () => {
    state.allowed = true
    state.pendingPayment = true
    const html = renderToStaticMarkup(
      <SuperadminPage search={{ empresa: tenantId, seccion: 'modulos' }} />,
    )

    expect(html).toContain('Cambios bloqueados')
    expect(html).not.toContain('Condiciones de facturación')
    expect(state.queries).toEqual([
      ['platform-access', 'platform-user'],
      ['platform-company', tenantId],
      ['billing-preview', tenantId],
    ])
  })

  it('handles a company that no longer exists without requesting its payments', () => {
    state.allowed = true
    state.missingCompany = true
    const html = renderToStaticMarkup(
      <SuperadminPage search={{ empresa: tenantId, seccion: 'pagos' }} />,
    )
    expect(html).toContain('No se ha encontrado la empresa')
    expect(state.queries).toEqual([
      ['platform-access', 'platform-user'],
      ['platform-company', tenantId],
    ])
  })

  it.each([
    { role: 'user', path: '/mi-jornada', label: 'Empresa activa' },
    { role: 'admin', path: '/', label: 'Empresa activa' },
    { role: null, path: '/', label: 'la aplicación' },
  ] as const)('returns the $role account to the right workspace', ({ role, path, label }) => {
    state.allowed = true
    state.role = role
    const html = renderToStaticMarkup(<SuperadminPage search={{ empresa: tenantId }} />)

    expect(html).toContain(`<a href="${path}">`)
    expect(html).toContain(`Volver a ${label}</span>`)
    expect(html).toContain('Condiciones de facturación')
  })
})
