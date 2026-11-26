import type * as ReactQuery from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { WelcomePage } from './welcome-page'

const { query, navigate, refetch } = vi.hoisted(() => ({
  query: vi.fn(),
  navigate: vi.fn(),
  refetch: vi.fn(),
}))

vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}))
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof ReactQuery>()),
  useQuery: query,
  useQueryClient: () => ({}),
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useRouter: () => ({}),
}))
vi.mock('@/features/auth', () => ({
  useSession: () => ({ tenantId: 'company-1', email: 'owner@example.test' }),
  useCompanyActions: () => ({}),
  useSignOut: () => vi.fn(),
  FormError: () => null,
}))
vi.mock('@/features/billing', async () => ({
  ...(await import('@/features/billing/domain/plans')),
  billingCatalogQuery: { queryKey: ['catalog'] },
  billingProfileQuery: () => ({ queryKey: ['profile'] }),
  startOnboardingCheckout: vi.fn(),
  submitToRedsys: vi.fn(),
  SubscriptionBillingProfileForm: () => null,
  tenantAccessQuery: () => ({ queryKey: ['access'] }),
}))
vi.mock('@/features/product-modules', async () => ({
  ...(await import('@/features/product-modules/domain/modules')),
  moduleCatalogQuery: { queryKey: ['modules'] },
}))

describe('guided onboarding screen', () => {
  it('shows the available options before the payment or the workspace', () => {
    query.mockImplementation(({ queryKey: [key] }) => {
      if (key === 'company-onboarding') return { data: { stage: 'selection' }, refetch }
      if (key === 'catalog')
        return {
          data: [
            {
              plan: 'standard',
              seats: 1,
              monthly_cents: 3480,
              yearly_cents: 34800,
              vat_percent: 21,
            },
          ],
        }
      if (key === 'modules')
        return {
          data: ['workers', 'procurement', 'mcp', 'ai'].map((code) => ({
            code,
            monthly_cents: 900,
            yearly_cents: 9000,
          })),
        }
      return {}
    })
    const html = renderToStaticMarkup(<WelcomePage />)
    expect(html).toContain('Elegir licencias')
    expect(html).toContain('Añadir Asistente de IA')
    expect(html).toContain('Ver qué incluye')
    expect(html).not.toContain('Pagar y suscribirme')
    expect(html).not.toContain('prueba gratuita')
  })

  it('waits for the provider and never offers another charge while payment is pending', () => {
    query.mockReturnValue({ data: { stage: 'pending' }, refetch })
    const html = renderToStaticMarkup(<WelcomePage />)
    expect(html).toContain('Estamos comprobando el pago')
    expect(html).not.toContain('Pagar y suscribirme')
    expect(html).not.toContain('Ver horas disponibles')
  })

  it('requires a booking after payment, and stops safely when no scheduler is configured', () => {
    query.mockReturnValue({ data: { stage: 'booking' }, refetch })
    const html = renderToStaticMarkup(<WelcomePage />)
    expect(html).toContain('Reserva tu sesión de puesta en marcha')
    expect(html).toContain('No se puede abrir la agenda con esta cuenta')
    expect(html).not.toContain('Pagar y suscribirme')
    expect(navigate).not.toHaveBeenCalled()
  })
})
