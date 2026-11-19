import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { billingCatalogQuery, billingPreviewQuery, type BillingTerms } from '@/features/billing'
import {
  ModuleSubscriptions,
  moduleCatalogQuery,
  moduleSubscriptionsQuery,
} from '@/features/product-modules'

import { scheduleBillingAgreement, setCompanyBillingVat } from '../application/superadmin-queries'
import { CompanyBillingAgreement } from './company-billing-agreement'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/shared/lib/supabase/client', () => ({ createBrowserSupabaseClient: () => ({ rpc }) }))

const tenantId = 'company'
const current: BillingTerms = {
  plan: 'team',
  seats: 5,
  period: 'month',
  net_cents: 3400,
  amount_cents: 4114,
  vat_percent: 21,
}
const next: BillingTerms = {
  ...current,
  period: 'year',
  net_cents: 48750,
  base_net_cents: 29750,
  module_net_cents: 19000,
  amount_cents: 58988,
}
const preview = {
  current,
  next,
  pending: false,
  cancel_at_period_end: false,
  vat_percent: 21,
  module_yearly_cents: 19000,
}

let client: QueryClient

function render(children: ReactNode) {
  return renderToStaticMarkup(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}

function renderBilling(members: number) {
  return render(
    <CompanyBillingAgreement tenantId={tenantId} members={members} subscriptionStatus="active" />,
  )
}

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null })
  client = new QueryClient()
  client.setQueryData(billingCatalogQuery.queryKey, [
    { plan: 'team', seats: 5, monthly_cents: 3400, yearly_cents: 34000, vat_percent: 21 },
    { plan: 'business', seats: 15, monthly_cents: 5400, yearly_cents: 54000, vat_percent: 21 },
  ])
  client.setQueryData(billingPreviewQuery(tenantId).queryKey, preview)
})

describe('company billing controls', () => {
  it('adds the modules to the preview without folding them into the negotiated base price', () => {
    const html = renderBilling(3)
    expect(html).toMatch(/41,14\s*€ con IVA \/ mes/)
    expect(html).toMatch(/Total previsto: 589,88\s*€ con IVA \/ año/)
    expect(html).toContain('<option value="agreed" selected="">Precio pactado</option>')
    expect(html).toContain('value="297,50"')
    expect(html).toMatch(/<button\b(?![^>]*\bdisabled=)[^>]*>Guardar condiciones<\/button>/)
  })

  it('does not save a tier with insufficient seats or show an editor while a payment is pending', () => {
    const insufficient = renderBilling(6)
    expect(insufficient).toMatch(/<button\b[^>]*\bdisabled=""[^>]*>Guardar condiciones<\/button>/)
    const capacityId = /<label\b[^>]*for="([^"]+)"[^>]*>Plan y capacidad<\/label>/.exec(
      insufficient,
    )?.[1]
    expect(capacityId).toBeDefined()
    expect(insufficient).toContain(`aria-describedby="${capacityId}-hint ${capacityId}-error"`)
    expect(insufficient).toContain(`id="${capacityId}-error">El tramo no cubre al equipo.`)
    client.setQueryData(billingPreviewQuery(tenantId).queryKey, { ...preview, pending: true })
    const html = renderBilling(3)
    expect(html).toContain('Resuelve el pago pendiente')
    expect(html).not.toContain('Guardar condiciones')
  })

  it('uses the company agreement RPC for an exact net amount or the catalogue rate', async () => {
    const terms = { plan: 'team', seats: 5, period: 'year' } as const
    await scheduleBillingAgreement(tenantId, { ...terms, netCents: 29750 })
    await scheduleBillingAgreement(tenantId, { ...terms, netCents: null })
    const params = { p_tenant: tenantId, p_plan: 'team', p_seats: 5, p_period: 'year' }
    expect(rpc).toHaveBeenNthCalledWith(1, 'superadmin_schedule_billing', {
      ...params,
      p_net: 29750,
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'superadmin_schedule_billing', {
      ...params,
      p_net: null,
    })
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('allows a 0 % VAT override without changing the plan or the agreed price', async () => {
    client.setQueryData(billingPreviewQuery(tenantId).queryKey, {
      ...preview,
      vat_percent: 0,
      next: { ...next, vat_percent: 0, amount_cents: 48750 },
    })
    const html = renderBilling(3)
    expect(html).toContain('<option value="0" selected="">0 % · Sin IVA</option>')
    expect(html).toMatch(/Total previsto: 487,50\s*€ sin IVA \(0 %\)/)
    expect(html).toMatch(/41,14\s*€ con IVA \/ mes/)
    await setCompanyBillingVat(tenantId, 0)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('superadmin_set_billing_vat', {
      p_tenant: tenantId,
      p_vat: 0,
    })
  })
})

describe('company module controls', () => {
  it('distinguishes a scheduled paid activation from access that is already enabled', () => {
    client.setQueryData(moduleSubscriptionsQuery(tenantId).queryKey, [
      {
        module_code: 'procurement',
        enabled: false,
        next_enabled: true,
        monthly_cents: 1900,
        yearly_cents: 19000,
      },
    ])
    client.setQueryData(moduleCatalogQuery.queryKey, [
      { code: 'procurement', monthly_cents: 1900, yearly_cents: 19000 },
    ])
    const html = render(<ModuleSubscriptions tenantId={tenantId} active onChanged={vi.fn()} />)
    expect(html).toContain('Compras e inventario · Inactivo')
    expect(html).toContain('Alta programada')
    expect(html).toContain('Deshacer cambio')
    expect(html).toMatch(/19,00\s*€\/mes o \+190,00\s*€\/año/)
  })
})
