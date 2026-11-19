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
vi.mock('./plan-option-card', () => ({
  PlanOptionCard: ({ children }: { children: ReactNode }) => <article>{children}</article>,
}))

it('lists the pilot surcharge separately from the amount sent to plan checkout', () => {
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
  const action = vi.fn(() => null)

  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <PricingCatalog renderAction={action} />
    </QueryClientProvider>,
  )

  expect(html).toContain('contratos recurrentes y visitas')
  expect(html).toContain('Compras e inventario')
  expect(html).toMatch(/\+19,00\s*€ al mes/)
  expect(html).toContain('Ajustes → Plan y facturación')
  expect(action).toHaveBeenCalledWith(
    expect.objectContaining({ net_cents: 3490, amount_cents: 4223 }),
    expect.objectContaining({ id: 'team', name: 'Equipo Plus', benefit: 'Coordina el equipo' }),
  )
})
