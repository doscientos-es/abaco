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

import {
  restoreBillingCatalog,
  scheduleBillingAgreement,
  setCompanyBillingVat,
} from '../application/superadmin-queries'
import type { PlatformSearch } from '../domain/platform-navigation'
import { CompanyBillingAgreement } from './company-billing-agreement'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/shared/lib/supabase/client', () => ({ createBrowserSupabaseClient: () => ({ rpc }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    search,
    to,
  }: {
    children: ReactNode
    search: Record<string, string>
    to: string
  }) => <a href={`${to}?${new URLSearchParams(search)}`}>{children}</a>,
}))

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
  fixed_net_cents: 29750,
  module_yearly_cents: 19000,
}

let client: QueryClient

function render(children: ReactNode) {
  return renderToStaticMarkup(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}

function renderBilling(members: number, edicion?: PlatformSearch['edicion']) {
  return render(
    <CompanyBillingAgreement
      tenantId={tenantId}
      members={members}
      subscriptionStatus="active"
      search={{ empresa: tenantId, ...(edicion && { edicion }) }}
    />,
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
  it('shows both edit links, but no editable fields, in the subscription detail', () => {
    const html = renderBilling(3)
    expect(html).toContain('IVA del próximo cobro')
    expect(html).toContain('21 %')
    expect(html).toContain(`href="/superadmin?empresa=${tenantId}&amp;edicion=cuota"`)
    expect(html).toContain(`href="/superadmin?empresa=${tenantId}&amp;edicion=iva"`)
    expect(html).not.toMatch(/<(input|select|form)\b/)
  })

  it('adds the modules to the preview without folding them into the negotiated base price', () => {
    const html = renderBilling(3, 'cuota')
    expect(html).toMatch(/41,14\s*€ con IVA \/ mes/)
    expect(html).toMatch(/Total previsto: 589,88\s*€ con IVA \/ año/)
    expect(html).toContain('<option value="agreed" selected="">Precio pactado</option>')
    expect(html).toContain('value="297,50"')
    expect(html).toMatch(/<button\b(?![^>]*\bdisabled=)[^>]*>Guardar condiciones<\/button>/)
  })

  it('does not save a tier with insufficient seats or show an editor while a payment is pending', () => {
    const insufficient = renderBilling(6, 'cuota')
    expect(insufficient).toMatch(/<button\b[^>]*\bdisabled=""[^>]*>Guardar condiciones<\/button>/)
    const capacityId = /<label\b[^>]*for="([^"]+)"[^>]*>Plan y capacidad<\/label>/.exec(
      insufficient,
    )?.[1]
    expect(capacityId).toBeDefined()
    expect(insufficient).toContain(`aria-describedby="${capacityId}-hint ${capacityId}-error"`)
    expect(insufficient).toContain(`id="${capacityId}-error">El tramo no cubre al equipo.`)
    client.setQueryData(billingPreviewQuery(tenantId).queryKey, { ...preview, pending: true })
    const html = renderBilling(3, 'cuota')
    expect(html).toContain('Resuelve el pago pendiente')
    expect(html).not.toContain('Guardar condiciones')
    expect(renderBilling(3)).toMatch(
      /<button\b[^>]*\bdisabled=""[^>]*>Volver a tarifa de catálogo<\/button>/,
    )
  })

  it('offers a one-click restoration even when the negotiated amount equals the catalogue', async () => {
    client.setQueryData(billingPreviewQuery(tenantId).queryKey, {
      ...preview,
      fixed_net_cents: 34000,
      next: { ...next, base_net_cents: 34000, net_cents: 53000, amount_cents: 64130 },
    })
    const html = renderBilling(3)
    expect(html).toMatch(/Catálogo: 340,00\s*€ sin IVA \/ año/)
    expect(html).toMatch(/<button\b(?![^>]*\bdisabled=)[^>]*>Volver a tarifa de catálogo<\/button>/)

    await restoreBillingCatalog(tenantId, 34000)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('superadmin_restore_billing_catalog', {
      p_tenant: tenantId,
      p_expected_net: 34000,
    })
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
    const vat = renderBilling(3, 'iva')
    expect(vat).toContain('<option value="0" selected="">0 % · Sin IVA</option>')
    expect(vat).not.toContain('Guardar condiciones')
    const agreement = renderBilling(3, 'cuota')
    expect(agreement).toMatch(/Total previsto: 487,50\s*€ sin IVA \(0 %\)/)
    expect(agreement).toMatch(/41,14\s*€ con IVA \/ mes/)
    await setCompanyBillingVat(tenantId, 0)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('superadmin_set_billing_vat', {
      p_tenant: tenantId,
      p_vat: 0,
    })
  })
})

describe('company module controls', () => {
  it('shows module status in the list, then requires explicit edit before confirming a surcharge', () => {
    client.setQueryData(moduleSubscriptionsQuery(tenantId).queryKey, [])
    client.setQueryData(moduleCatalogQuery.queryKey, [
      { code: 'procurement', monthly_cents: 1900, yearly_cents: 19000 },
    ])
    const base = { tenantId, active: true, period: 'year', onChanged: vi.fn() } as const
    const list = render(
      <ModuleSubscriptions
        {...base}
        navigation={{
          renderRow: ({ name, status }) => (
            <a href="?modulo=procurement">
              {name} · {status}
            </a>
          ),
        }}
      />,
    )
    expect(list).toContain('Compras e inventario · Inactivo')
    expect(list).not.toContain('<button')

    const detail = {
      code: 'procurement',
      editing: false,
      editLink: <a href="?edicion=modulo">Editar módulo</a>,
    } as const
    const readOnly = render(<ModuleSubscriptions {...base} navigation={detail} />)
    expect(readOnly).toContain('Editar módulo')
    expect(readOnly).not.toContain('Guardar cambio')

    const editing = render(
      <ModuleSubscriptions {...base} navigation={{ ...detail, editing: true }} />,
    )
    expect(editing).toMatch(/Activar Compras e inventario\. \+190,00\s*€\/año, sin IVA/)
    expect(editing).toContain('Guardar cambio')
    const blocked = render(
      <ModuleSubscriptions {...base} blocked navigation={{ ...detail, editing: true }} />,
    )
    expect(blocked).not.toContain('Guardar cambio')
  })

  it('distinguishes a scheduled paid activation from access that is already enabled', () => {
    client.setQueryData(moduleSubscriptionsQuery(tenantId).queryKey, [
      {
        module_code: 'procurement',
        enabled: false,
        next_enabled: true,
        monthly_cents: 1900,
        yearly_cents: 18000,
      },
    ])
    client.setQueryData(moduleCatalogQuery.queryKey, [
      { code: 'procurement', monthly_cents: 1900, yearly_cents: 19000 },
    ])
    const html = render(<ModuleSubscriptions tenantId={tenantId} active onChanged={vi.fn()} />)
    expect(html).toContain('Compras e inventario · Inactivo')
    expect(html).toContain('Alta programada')
    expect(html).toContain('Deshacer cambio')
    expect(html).toMatch(/19,00\s*€\/mes o \+180,00\s*€\/año/)
    const annual = render(
      <ModuleSubscriptions tenantId={tenantId} active period="year" onChanged={vi.fn()} />,
    )
    expect(annual).toMatch(/\+180,00\s*€\/año, sin IVA/)
    expect(annual).not.toContain('/mes')
  })
})
