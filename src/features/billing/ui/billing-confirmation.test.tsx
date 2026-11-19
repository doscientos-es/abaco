import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { catalogQuote, type BillingTerms } from '../domain/plans'
import { BillingSection } from './billing-section'

const fixtures = vi.hoisted(() => ({
  button: vi.fn(),
  accept: vi.fn(),
  submit: vi.fn(),
  state: vi.fn(),
  effect: vi.fn(),
  invalidate: vi.fn(),
  status: 'trialing',
  pending: false,
  courtesy: false,
  members: 16,
  moduleYearly: 0,
  vatPercent: 21,
  managed: false,
}))
const terms: BillingTerms = {
  plan: 'scale',
  seats: 25,
  period: 'year',
  net_cents: 69000,
  amount_cents: 83490,
  vat_percent: 21,
}
const current = { ...terms, period: 'month', net_cents: 6900, amount_cents: 8349 }

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: fixtures.state,
  useEffect: fixtures.effect,
}))
vi.mock('@doscientos/ui', () => ({ Button: fixtures.button }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: fixtures.invalidate }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data:
      queryKey[0] === 'subscription'
        ? {
            status: fixtures.status,
            plan: 'scale',
            isComplimentary: fixtures.courtesy,
            nextPlan: fixtures.managed ? 'scale' : null,
          }
        : queryKey[0] === 'billing-preview'
          ? {
              current,
              next: current,
              pending: fixtures.pending,
              module_yearly_cents: fixtures.moduleYearly,
              vat_percent: fixtures.vatPercent,
              next_managed: fixtures.managed,
            }
          : queryKey[0] === 'billing-catalog'
            ? undefined
            : fixtures.members,
  }),
}))
vi.mock('../application/billing-actions', () => ({
  acceptBillingTerms: fixtures.accept,
  submitToRedsys: fixtures.submit,
  billingPreviewQuery: () => ({ queryKey: ['billing-preview'] }),
  billingCatalogQuery: { queryKey: ['billing-catalog'] },
  subscriptionQuery: () => ({ queryKey: ['subscription'] }),
  memberCountQuery: () => ({ queryKey: ['member-count'] }),
}))
vi.mock('./pricing-catalog', () => ({
  PricingCatalog: ({
    renderAction,
    vatPercent,
  }: {
    renderAction: (terms: BillingTerms, plan: { name: string }) => React.ReactNode
    vatPercent: number
  }) =>
    renderAction(
      catalogQuote(
        { plan: 'scale', seats: 25, monthly_cents: 6900, yearly_cents: 69000, vat_percent: 21 },
        'year',
        vatPercent,
      ),
      { name: 'Escala' },
    ),
}))
vi.mock('./payment-history', () => ({ PaymentHistory: () => null }))
vi.mock('./subscription-billing-profile-form', () => ({
  SubscriptionBillingProfileForm: () => null,
}))
vi.mock('@/features/product-modules', () => ({
  ModuleSubscriptions: () => null,
  moduleSubscriptionsQuery: () => ({ queryKey: ['module-subscriptions'] }),
  tenantModulesQuery: () => ({ queryKey: ['tenant-modules'] }),
}))

const render = () =>
  renderToStaticMarkup(<BillingSection tenantId="company" companyName="Company" />)
const action = (name: string) =>
  fixtures.button.mock.calls.find(([props]) => props.children === name)?.[0]

describe('billing confirmation', () => {
  let selection: unknown

  beforeEach(() => {
    vi.resetAllMocks()
    fixtures.status = 'trialing'
    fixtures.members = 16
    fixtures.pending = false
    fixtures.courtesy = false
    fixtures.moduleYearly = 0
    fixtures.vatPercent = 21
    fixtures.managed = false
    selection = null
    fixtures.state.mockImplementation((initial: unknown) => {
      if (typeof initial === 'function') return [null, vi.fn()]
      if (initial === null)
        return [
          selection,
          (value: unknown) => {
            if (value && typeof value === 'object') selection = value
          },
        ]
      return [initial, vi.fn()]
    })
    fixtures.button.mockImplementation(
      ({ children, isDisabled }: { children: React.ReactNode; isDisabled?: boolean }) => (
        <button disabled={isDisabled}>{children}</button>
      ),
    )
  })

  it('shows and confirms the untaxed amount, including modules, at 0 % VAT', async () => {
    fixtures.vatPercent = 0
    fixtures.moduleYearly = 19000
    fixtures.accept.mockResolvedValue({ ok: true })
    render()
    action('Elegir Escala').onPress()
    expect(render()).toMatch(/880,00\s*€ sin IVA \(0 %\)/)
    action('Continuar a Redsys').onPress()
    await vi.waitFor(() =>
      expect(fixtures.accept).toHaveBeenCalledWith(
        'company',
        'checkout',
        expect.objectContaining({ amount_cents: 88000, vat_percent: 0 }),
      ),
    )
  })

  it('requires confirmation of the gross annual charge before sending the exact quote to Redsys', async () => {
    fixtures.moduleYearly = 19000
    fixtures.accept.mockResolvedValue({ ok: true, form: { url: 'https://example.test' } })
    render()
    action('Elegir Escala').onPress()
    expect(fixtures.accept).not.toHaveBeenCalled()
    const html = render()
    expect(html).toMatch(/1\.064,80\s*€|1064,80\s*€/)
    expect(html).toMatch(/190,00\s*€ en módulos/)
    expect(html).toContain('Continuar a Redsys')
    action('Continuar a Redsys').onPress()
    await vi.waitFor(() => expect(fixtures.submit).toHaveBeenCalled())
    expect(fixtures.accept).toHaveBeenCalledWith('company', 'checkout', {
      ...terms,
      base_net_cents: 69000,
      module_net_cents: 19000,
      net_cents: 88000,
      amount_cents: 106480,
    })
  })

  it('lets a monthly Scale customer schedule annual billing without starting checkout', async () => {
    fixtures.status = 'active'
    fixtures.accept.mockResolvedValue({ ok: true })
    render()
    action('Elegir Escala').onPress()
    expect(render()).toContain('sin cobro inmediato')
    action('Programar cambio').onPress()
    await vi.waitFor(() => expect(fixtures.accept).toHaveBeenCalledWith('company', 'change', terms))
    expect(fixtures.submit).not.toHaveBeenCalled()
  })

  it('does not let users repeat an unresolved payment or buy a tier too small', () => {
    fixtures.pending = true
    expect(render()).toContain('No repitas el pago')
    expect(action('Elegir Escala').isDisabled).toBe(true)
    fixtures.pending = false
    fixtures.members = 26
    render()
    expect(action('No cubre a tu equipo').isDisabled).toBe(true)
  })

  it('shows the upcoming charge without offering to undo a platform agreement', () => {
    fixtures.status = 'active'
    fixtures.managed = true
    const html = render()
    expect(html).toContain('Próxima renovación')
    expect(html).toContain('Ábaco ha programado las próximas condiciones')
    expect(action('Retirar el cambio programado')).toBeUndefined()
  })

  it('does not offer payments for a courtesy company', () => {
    fixtures.courtesy = true
    expect(render()).toContain('Acceso de cortesía')
    expect(action('Elegir Escala')).toBeUndefined()
  })
})
