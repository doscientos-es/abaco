import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BillingResult } from '../application/billing-actions'
import { formatEuros, perMonthWhenYearly, planCatalog, type Interval } from '../domain/plans'
import { BillingSection } from './billing-section'

const {
  state,
  effect,
  button,
  checkout,
  change,
  submit,
  invalidate,
  setBusy,
  setError,
  queryState,
} = vi.hoisted(() => ({
  state: vi.fn(),
  effect: vi.fn(),
  button: vi.fn(),
  checkout: vi.fn(),
  change: vi.fn(),
  submit: vi.fn(),
  invalidate: vi.fn(),
  setBusy: vi.fn(),
  setError: vi.fn(),
  queryState: { members: 1, plan: 'trial', status: 'trialing' },
}))

// Exercise the component's handlers without adding a browser-testing dependency.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: state,
  useEffect: effect,
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidate }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data:
      queryKey[0] === 'subscription'
        ? { plan: queryState.plan, status: queryState.status, canWrite: true, trialDaysLeft: 14 }
        : queryState.members,
  }),
}))
vi.mock('@doscientos/ui', () => ({
  Button: button,
  LinkButton: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))
vi.mock('../application/billing-actions', () => ({
  startCheckout: checkout,
  submitToRedsys: submit,
  cancelPlan: vi.fn(),
  changePlan: change,
  resumePlan: vi.fn(),
  subscriptionQuery: (id: string) => ({ queryKey: ['subscription', id] }),
  memberCountQuery: (id: string) => ({ queryKey: ['member-count', id] }),
}))
vi.mock('./payment-history', () => ({ PaymentHistory: () => null }))
vi.mock('./custom-plan-card', () => ({
  CustomPlanCard: () => <article>Plan personalizado</article>,
}))

const form = {
  url: 'https://payments.example/checkout',
  signatureVersion: 'test-version',
  merchantParameters: 'test-parameters',
  signature: 'test-signature',
}
const render = () =>
  renderToStaticMarkup(<BillingSection tenantId="trial-company" companyName="Trial company" />)
const soloPlan = () => {
  const plan = planCatalog.find((candidate) => candidate.id === 'solo')
  if (!plan) throw new Error('Autónomo plan is missing')
  return plan
}
const choose = () => {
  const props = button.mock.calls.find(([props]) => props.children === 'Elegir Autónomo')?.[0]
  expect(props).toBeDefined()
  props.onPress()
}

describe('BillingSection payment recovery', () => {
  let busy: string | null
  let interval: Interval
  let error: string
  let page: EventTarget
  let selectedMembers: number | undefined

  beforeEach(() => {
    vi.resetAllMocks()
    queryState.members = 1
    queryState.plan = 'trial'
    queryState.status = 'trialing'
    busy = null
    interval = 'year'
    error = ''
    selectedMembers = undefined
    page = new EventTarget()
    vi.stubGlobal('window', page)
    setBusy.mockImplementation((value: string | null) => {
      busy = value
    })
    setError.mockImplementation((value: string) => {
      error = value
    })
    state.mockImplementation((initial: unknown) => {
      if (initial === null) return [busy, setBusy]
      if (initial === '') return [error, setError]
      if (initial === 'year') return [interval, vi.fn()]
      if (initial === undefined) return [selectedMembers, vi.fn()]
      if (typeof initial === 'function') return [null, vi.fn()]
      return [initial, vi.fn()]
    })
    button.mockImplementation(
      ({ children, isDisabled }: { children: React.ReactNode; isDisabled?: boolean }) => (
        <button disabled={isDisabled}>{children}</button>
      ),
    )
    invalidate.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('compares the plans with the team-size selector and annual amounts', () => {
    const html = render()
    const solo = soloPlan()

    expect(html).toContain('Todos los planes incluyen las mismas funciones')
    expect(html).toContain('Personas con acceso')
    expect(html).toContain('type="range"')
    expect(html).toContain('aria-label="Ajustar el número de personas"')
    expect(html).toContain('max="100"')
    expect(html).toContain('aria-label="Autónomo, hasta 1 persona"')
    expect(html).toContain('Elegir Equipo')
    expect(html).toContain('Elegir Empresa')
    expect(html).toContain('Ábaco Escala')
    expect(html).toContain('Plan personalizado')
    expect(html).toContain('/mes equivalente')
    expect(html).toContain(formatEuros(perMonthWhenYearly(solo)))
    expect(html).toContain(`Se cobran ${formatEuros(solo.yearly)} al año, sin IVA.`)
    expect(html).not.toContain('Pago mensual, sin IVA.')
  })

  it('recommends the smallest plan that fits the existing team', () => {
    queryState.members = 3
    const html = render()

    expect(html).toContain('min="3"')
    expect(html).toContain('No cubre a tu equipo')
    expect(html).toContain('Elegir Equipo')
    expect(html).toContain('Elegir Empresa')
    expect(html).not.toContain('Elegir Autónomo')
    const tooSmall = button.mock.calls.find(
      ([props]) => props.children === 'No cubre a tu equipo',
    )?.[0]
    expect(tooSmall.isDisabled).toBe(true)
  })

  it('routes teams of 16 to 100 to a proposal instead of an unconfigured checkout price', () => {
    queryState.members = 32
    const html = render()

    expect(html).toContain('value="32"')
    expect(html).toContain('aria-label="Ábaco Escala, 16 a 100 personas"')
    expect(html).toContain(`${formatEuros(1050)} al año para 32 personas, sin IVA.`)
    expect(html).toContain('Tarifa mensual orientativa')
    expect(html).toContain('href="tel:+34624140151"')
    expect(html).not.toContain('Elegir Empresa')
    expect(checkout).not.toHaveBeenCalled()
  })

  it('updates the recommended tier to match the selected team size', () => {
    selectedMembers = 16
    const html = render()
    const scale = html.match(/<article aria-label="Ábaco Escala[^]*?<\/article>/)?.[0]

    expect(scale).toContain('Te encaja')
    expect(scale).toContain(`${formatEuros(570)} al año para 16 personas, sin IVA.`)
    expect(html).not.toContain('Elegir Empresa')
  })

  it('shows the personalized offer without a slider for teams above 100', () => {
    queryState.members = 101
    const html = render()

    expect(html).toContain('Plan personalizado')
    expect(html).not.toContain('type="range"')
  })

  it('distinguishes monthly billing from an annual equivalent', () => {
    interval = 'month'
    const html = render()

    const solo = soloPlan()
    expect(html).toContain(formatEuros(solo.monthly))
    expect(html).toContain('Pago mensual, sin IVA.')
    expect(html).not.toContain('/mes equivalente')
    expect(html).not.toContain('al año, sin IVA')
  })

  it('disables the chosen plan during checkout and releases it after the payment handoff', async () => {
    let finish: (result: BillingResult) => void = () => { }
    checkout.mockReturnValue(
      new Promise<BillingResult>((resolve) => {
        finish = resolve
      }),
    )
    render()
    choose()
    expect(busy).toBe('solo')

    button.mockClear()
    render()
    const pending = button.mock.calls.find(([props]) => props.children === 'Elegir Autónomo')?.[0]
    expect(pending.isDisabled).toBe(true)
    const otherPlan = button.mock.calls.find(([props]) => props.children === 'Elegir Equipo')?.[0]
    expect(otherPlan.isDisabled).toBe(true)

    finish({ ok: true, form })
    await vi.waitFor(() => expect(busy).toBeNull())
    expect(submit).toHaveBeenCalledWith(form)
    expect(checkout).toHaveBeenCalledWith('trial-company', 'solo', 'year')
  })

  it('uses a plan change instead of a new checkout for active subscriptions', async () => {
    queryState.plan = 'solo'
    queryState.status = 'active'
    change.mockResolvedValue({ ok: true })
    render()
    const option = button.mock.calls.find(([props]) => props.children === 'Elegir Equipo')?.[0]

    option.onPress()
    await vi.waitFor(() => expect(change).toHaveBeenCalledWith('trial-company', 'team', 'year'))
    expect(checkout).not.toHaveBeenCalled()
  })

  it('releases the button and displays an error when checkout throws', async () => {
    checkout.mockRejectedValue(new Error('Unavailable'))
    render()
    choose()

    await vi.waitFor(() => expect(busy).toBeNull())
    expect(error).toBe('No se pudo completar la operación. Inténtalo de nuevo.')
    expect(submit).not.toHaveBeenCalled()
  })

  it('releases the button if submitting the payment form fails', async () => {
    checkout.mockResolvedValue({ ok: true, form })
    submit.mockImplementation(() => {
      throw new Error('Navigation failed')
    })
    render()
    choose()

    await vi.waitFor(() => expect(busy).toBeNull())
    expect(error).toBe('No se pudo completar la operación. Inténtalo de nuevo.')
  })

  it('releases the button when checkout returns a failure', async () => {
    checkout.mockResolvedValue({ ok: false, message: 'No se pudo iniciar el pago.' })
    render()
    choose()

    await vi.waitFor(() => expect(busy).toBeNull())
    expect(error).toBe('No se pudo iniciar el pago.')
  })

  it('resets a cached disabled state on browser Back and refreshes billing data', () => {
    busy = 'solo'
    render()
    const cleanup = effect.mock.calls.map(([callback]) => callback()).find(Boolean)
    const restored = new Event('pageshow')
    Object.defineProperty(restored, 'persisted', { value: true })

    page.dispatchEvent(restored)
    expect(busy).toBeNull()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['subscription', 'trial-company'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['billing-payments', 'trial-company'] })

    cleanup()
    busy = 'solo'
    page.dispatchEvent(restored)
    expect(busy).toBe('solo')
  })

  it('does not unlock an in-flight checkout on an ordinary pageshow event', () => {
    busy = 'solo'
    render()
    const cleanup = effect.mock.calls.map(([callback]) => callback()).find(Boolean)

    page.dispatchEvent(new Event('pageshow'))
    expect(busy).toBe('solo')
    expect(invalidate).not.toHaveBeenCalled()
    cleanup()
  })
})
