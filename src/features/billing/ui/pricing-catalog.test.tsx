import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

import { moduleCatalogQuery } from '@/features/product-modules'

import { billingCatalogQuery } from '../application/billing-actions'
import { PricingCatalog } from './pricing-catalog'

vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  Input: () => <input />,
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}))
vi.mock('./custom-plan-card', () => ({ CustomPlanCard: () => null }))

function catalogClient() {
  const queryClient = new QueryClient()
  queryClient.setQueryData(billingCatalogQuery.queryKey, [
    {
      plan: 'standard',
      seats: 1,
      monthly_cents: 3480,
      yearly_cents: 34800,
      seat_monthly_cents: 800,
      vat_percent: 21,
      plan_info: {
        name: 'Ábaco',
        audience: 'Para cuadrillas',
        benefit: 'Coordina el equipo',
        revision: 2,
      },
    },
  ])
  queryClient.setQueryData(moduleCatalogQuery.queryKey, [
    { code: 'workers', monthly_cents: 900, yearly_cents: 9000 },
    { code: 'procurement', monthly_cents: 1500, yearly_cents: 15000 },
    { code: 'mcp', monthly_cents: 900, yearly_cents: 9000 },
  ])
  return queryClient
}

it('shows the annual base and additional-person prices for the requested capacity', () => {
  const html = renderToStaticMarkup(
    <QueryClientProvider client={catalogClient()}>
      <PricingCatalog actualMembers={3} />
    </QueryClientProvider>,
  )
  expect(html).toContain('Ábaco, 3 personas')
  expect(html).toMatch(/45,00\s*€/)
  expect(html).toMatch(/653,40\s*€ con IVA/)
  expect(html).toMatch(/348,00\s*€ de cuota base/)
  expect(html).toMatch(/96,00\s*€ por cada plaza adicional/)
  expect(html).not.toContain('tramos')
})

it('lists the pilot surcharge separately from the amount sent to plan checkout', () => {
  const queryClient = catalogClient()
  const action = vi.fn(() => null)

  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <PricingCatalog renderAction={action} />
    </QueryClientProvider>,
  )

  expect(html).toContain('contratos recurrentes y visitas')
  expect(html).toContain('Trabajadores')
  expect(html).toContain('Proveedores')
  expect(html).toMatch(/\+90,00\s*€ al año/)
  expect(html).toMatch(/\+150,00\s*€ al año/)
  expect(html).toContain('Ajustes → Suscripción de Ábaco')
  expect(action).toHaveBeenCalledWith(
    expect.objectContaining({ net_cents: 34800, amount_cents: 42108 }),
    expect.objectContaining({ id: 'standard', name: 'Ábaco', benefit: 'Coordina el equipo' }),
  )
})

it('fails closed when the new catalogue price is unavailable', () => {
  const queryClient = catalogClient()
  queryClient.setQueryData(billingCatalogQuery.queryKey, [
    { plan: 'solo', seats: 1, monthly_cents: 2900, yearly_cents: 29000, vat_percent: 21 },
  ])
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <PricingCatalog />
    </QueryClientProvider>,
  )
  expect(html).toContain('La tarifa por persona todavía no está disponible.')
})

it('quotes the negotiated price and keeps its period when choosing capacity', () => {
  const action = vi.fn(() => null)
  const html = renderToStaticMarkup(
    <QueryClientProvider client={catalogClient()}>
      <PricingCatalog
        fixedPrice={{ period: 'year', netCents: 29000 }}
        renderAction={action}
        showModuleCatalog={false}
      />
    </QueryClientProvider>,
  )

  expect(html).toContain('Tu precio base pactado se mantiene al cambiar de capacidad')
  expect(html).not.toContain('2 meses de ahorro')
  expect(action).toHaveBeenCalledWith(
    expect.objectContaining({ period: 'year', net_cents: 29000, amount_cents: 35090 }),
    expect.objectContaining({ id: 'standard' }),
  )
})
