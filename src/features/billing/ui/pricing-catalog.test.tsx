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
  ])
  queryClient.setQueryData(moduleCatalogQuery.queryKey, [
    { code: 'procurement', monthly_cents: 1900, yearly_cents: 19000 },
  ])
  return queryClient
}

it('renders published prices and plan copy in the public cards and capacity breakdown', () => {
  const queryClient = catalogClient()
  queryClient.setQueryData(billingCatalogQuery.queryKey, [
    {
      plan: 'scale',
      seats: 25,
      monthly_cents: 7250,
      yearly_cents: 72500,
      vat_percent: 21,
      plan_info: {
        name: 'Cuadrillas Plus',
        audience: 'Para equipos en expansión',
        benefit: 'Coordina varias cuadrillas',
        revision: 3,
      },
    },
  ])

  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <PricingCatalog />
    </QueryClientProvider>,
  )

  expect(html).toContain('Cuadrillas Plus, hasta 25 personas')
  expect(html).toContain('Para equipos en expansión')
  expect(html).toContain('Coordina varias cuadrillas')
  expect(html).toContain('Ver todos los tramos de Cuadrillas Plus')
  expect(html).toMatch(/Hasta 25 personas: 72,50\s*€ al mes, sin IVA/)
  expect(html).toMatch(/87,73\s*€ con IVA, al mes/)
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
  expect(html).toContain('Módulo de trabajadores incluido.')
  expect(html).toContain('No está incluido en Autónomo.')
  expect(html).toContain('Compras e inventario')
  expect(html).toMatch(/\+19,00\s*€ al mes/)
  expect(html).toContain('Ajustes → Suscripción de Ábaco')
  expect(action).toHaveBeenCalledWith(
    expect.objectContaining({ net_cents: 3490, amount_cents: 4223 }),
    expect.objectContaining({ id: 'team', name: 'Equipo Plus', benefit: 'Coordina el equipo' }),
  )
})

it('shows that the solo plan excludes staff', () => {
  const queryClient = catalogClient()
  queryClient.setQueryData(billingCatalogQuery.queryKey, [
    { plan: 'solo', seats: 1, monthly_cents: 2000, yearly_cents: 20000, vat_percent: 21 },
  ])
  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <PricingCatalog />
    </QueryClientProvider>,
  )
  expect(html).toContain('Sin módulo de trabajadores.')
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
    expect.objectContaining({ id: 'team' }),
  )
})
