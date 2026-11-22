import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { companyFromInvoice, type PlatformSearch } from '../domain/platform-navigation'
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
const invoice = {
  id: 'pay-1',
  tenant_id: tenantId,
  company_name: company.name,
  invoice_number: 'FA-2030-01',
  invoice_status: 'sent',
  merchant_order: '0123AbCd',
  amount_cents: 3400,
  paid_at: '2030-07-15T12:00:00Z',
  invoice_portal_url: 'https://example.test/factura',
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
  useMutation: () => ({}),
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    state.queries.push(queryKey)
    if (queryKey[0] === 'platform-access') return { data: state.allowed }
    if (queryKey[0] === 'platform-companies') return { data: [company] }
    if (queryKey[0] === 'platform-company') return { data: state.missingCompany ? null : company }
    if (queryKey[0] === 'platform-company-profile') {
      return {
        data: {
          name: company.name,
          legal_name: 'Empresa de prueba SL',
          tax_id: '',
          email: '',
          phone: '',
          address: '',
          postal_code: '',
          city: '',
          website: '',
          updated_at: '2026-11-22T10:00:00Z',
        },
      }
    }
    if (queryKey[0] === 'billing-catalog') {
      return {
        data: [
          {
            plan: 'team',
            seats: 5,
            monthly_cents: 3490,
            yearly_cents: 34900,
            vat_percent: 21,
            plan_info: {
              name: 'Equipo Plus',
              audience: 'Para cuadrillas',
              benefit: 'Coordina el equipo',
              revision: 2,
            },
          },
        ],
      }
    }
    if (queryKey[0] === 'platform-invoices') {
      return {
        data: {
          rows: [invoice],
          hasMore: true,
        },
      }
    }
    if (queryKey[0] === 'platform-invoice-issuer') return { data: { revision: 0, profile: null } }
    if (queryKey[0] === 'platform-invoice') {
      return { data: queryKey[2] === invoice.merchant_order ? invoice : null }
    }
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

  it.each<PlatformSearch>([
    { empresa: tenantId, seccion: 'pagos' },
    { vista: 'facturas' },
    { vista: 'facturas', referencia: invoice.merchant_order },
    { vista: 'planes' },
  ])('does not request platform data without access: %j', (search) => {
    const html = renderToStaticMarkup(<SuperadminPage search={search} />)
    expect(html).toContain('No tienes acceso')
    expect(state.queries).toEqual([['platform-access', 'platform-user']])
  })

  it('queries the chosen directory page and carries it into the company link', () => {
    state.allowed = true
    const html = renderToStaticMarkup(<SuperadminPage search={{ q: 'prueba', page: 3 }} />)
    expect(html).toMatch(/<table[^>]*data-density="compact"[^>]*aria-label="Empresas de Ábaco"/)
    expect(html).toContain('Empresa de prueba')
    expect(html).toContain('3 personas')
    expect(html).toContain(`?q=prueba&amp;page=3&amp;empresa=${tenantId}`)
    expect(html).toContain(`?q=prueba&amp;page=3&amp;empresa=${tenantId}&amp;seccion=datos`)
    expect(html).toContain('Suscripción y precio')
    expect(state.queries).toEqual([
      ['platform-access', 'platform-user'],
      ['platform-companies', 'prueba', 100],
      ['billing-catalog'],
    ])
  })

  it('loads the company profile without querying payments or subscription controls', () => {
    state.allowed = true
    const html = renderToStaticMarkup(
      <SuperadminPage search={{ empresa: tenantId, seccion: 'datos' }} />,
    )
    expect(html).toContain('Empresa de prueba SL')
    expect(html).toContain('Editar datos')
    expect(html).toContain('Ir a suscripción y precio')
    expect(state.queries).toEqual([
      ['platform-access', 'platform-user'],
      ['platform-company', tenantId],
      ['billing-catalog'],
      ['platform-company-profile', tenantId],
    ])
  })

  it('loads a direct payment link by company ID and preserves the return to the directory', () => {
    state.allowed = true
    const html = renderToStaticMarkup(
      <SuperadminPage search={{ q: 'prueba', page: 3, empresa: tenantId, seccion: 'pagos' }} />,
    )

    expect(html).toContain('Factura PRUEBA-001')
    expect(html).toMatch(/<table[^>]*data-density="compact"[^>]*aria-label="Historial de cobros"/)
    expect(html).toContain('Correo aceptado por el proveedor')
    expect(html).toContain(`empresa=${tenantId}&amp;seccion=pagos" aria-current="page"`)
    expect(html).toMatch(/href="\/superadmin\?q=prueba&amp;page=3">[^<]*</)
    expect(state.queries).toEqual([
      ['platform-access', 'platform-user'],
      ['platform-company', tenantId],
      ['billing-catalog'],
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
      ['billing-catalog'],
      ['billing-preview', tenantId],
    ])
  })

  it('links a filtered invoice list to the read-only detail without opening the portal', () => {
    state.allowed = true
    const html = renderToStaticMarkup(
      <SuperadminPage search={{ vista: 'facturas', q: 'FA', factura: 'issued', page: 2 }} />,
    )
    expect(state.queries).toEqual([
      ['platform-access', 'platform-user'],
      ['platform-invoices', 'platform-user', 'FA', 2, 'issued'],
      ['platform-invoice-issuer', 'platform-user'],
    ])
    expect(html).toContain('FA-2030-01')
    expect(html).toMatch(
      /<table[^>]*data-density="compact"[^>]*aria-label="Facturas de suscripción"/,
    )
    expect(html).toContain('Correo aceptado por el proveedor')
    expect(html).toContain(
      `vista=facturas&amp;q=FA&amp;factura=issued&amp;page=2&amp;referencia=${invoice.merchant_order}`,
    )
    expect(html).not.toContain('href="https://example.test/factura"')
  })

  it('opens an invoice detail directly and retains the original list and company links', () => {
    state.allowed = true
    const search = {
      vista: 'facturas',
      q: 'FA',
      factura: 'issued',
      page: 2,
      referencia: invoice.merchant_order,
    } as const
    const html = renderToStaticMarkup(<SuperadminPage search={search} />)
    expect(state.queries).toEqual([
      ['platform-access', 'platform-user'],
      ['platform-invoice', 'platform-user', invoice.merchant_order],
    ])
    expect(html).toContain('Referencia bancaria')
    expect(html).toContain(invoice.merchant_order)
    expect(html).toContain(`empresa=${tenantId}&amp;seccion=pagos`)
    expect(html).toContain(
      `origen=facturas&amp;q=FA&amp;page=2&amp;factura=issued&amp;referencia=${invoice.merchant_order}`,
    )
    expect(html).toContain(
      'href="/superadmin?vista=facturas&amp;q=FA&amp;factura=issued&amp;page=2"',
    )
    expect(html).toContain('href="https://example.test/factura"')
  })

  it('links back to the filtered invoice list from the company profile', () => {
    state.allowed = true
    const search = companyFromInvoice(
      { vista: 'facturas', q: 'FA', factura: 'issued', page: 2 },
      tenantId,
    )
    const html = renderToStaticMarkup(<SuperadminPage search={search} />)
    expect(html).toMatch(
      /href="\/superadmin\?vista=facturas&amp;q=FA&amp;factura=issued&amp;page=2">[^]*?Volver a facturas<\/a>/,
    )
    expect(html).toContain('aria-label="Secciones de la empresa"')
  })

  it('shows the published catalog as a list, then a plan detail, then an explicit editor', () => {
    state.allowed = true
    const list = renderToStaticMarkup(<SuperadminPage search={{ vista: 'planes' }} />)
    expect(state.queries).toEqual([['platform-access', 'platform-user'], ['billing-catalog']])
    expect(list).toContain('Equipo Plus')
    expect(list).toMatch(/<table[^>]*data-density="compact"[^>]*aria-label="Tarifas de catálogo"/)
    expect(list).toContain('href="/precios"')
    expect(list).toContain('href="/superadmin?vista=planes&amp;plan=team"')
    expect(list).not.toContain('<input')

    const plan = { vista: 'planes', plan: 'team' } as const
    const detail = renderToStaticMarkup(<SuperadminPage search={plan} />)
    expect(detail).toContain('Coordina el equipo')
    expect(detail).toMatch(/349,00\s*€ al año/)
    expect(detail).toContain('href="/superadmin?vista=planes&amp;plan=team&amp;edicion=plan"')
    expect(detail).not.toContain('<input')

    const html = renderToStaticMarkup(<SuperadminPage search={{ ...plan, edicion: 'plan' }} />)
    expect(html).toContain('value="34,90"')
    expect(html).toMatch(/349,00\s*€ al año/)
    const priceId = /<label\b[^>]*for="([^"]+)"[^>]*>Hasta 5 personas · €\/mes<\/label>/.exec(
      html,
    )?.[1]
    expect(priceId).toBeDefined()
    expect(html).toContain(`aria-describedby="${priceId}-hint"`)
    expect(html).toContain('placeholder="Ej. 34,90"')
    expect(html).toContain('Volver al plan')
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
