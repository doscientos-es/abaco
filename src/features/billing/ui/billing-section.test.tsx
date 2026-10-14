import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BillingResult } from '../application/billing-actions'

import { BillingSection } from './billing-section'

const { state, effect, button, checkout, submit, invalidate, setBusy, setError } = vi.hoisted(() => ({
  state: vi.fn(), effect: vi.fn(), button: vi.fn(), checkout: vi.fn(), submit: vi.fn(),
  invalidate: vi.fn(), setBusy: vi.fn(), setError: vi.fn(),
}))

// Exercise the component's handlers without adding a browser-testing dependency.
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useState: state,
  useEffect: effect,
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidate }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === 'subscription'
      ? { plan: 'trial', status: 'trialing', canWrite: true, trialDaysLeft: 14 }
      : 1,
  }),
}))
vi.mock('@doscientos/ui', () => ({
  Button: button,
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))
vi.mock('../application/billing-actions', () => ({
  startCheckout: checkout,
  submitToRedsys: submit,
  cancelPlan: vi.fn(), changePlan: vi.fn(), resumePlan: vi.fn(),
  subscriptionQuery: (id: string) => ({ queryKey: ['subscription', id] }),
  memberCountQuery: (id: string) => ({ queryKey: ['member-count', id] }),
}))
vi.mock('./payment-history', () => ({ PaymentHistory: () => null }))
vi.mock('./custom-plan-card', () => ({ CustomPlanCard: () => null }))

const form = {
  url: 'https://payments.example/checkout', signatureVersion: 'test-version',
  merchantParameters: 'test-parameters', signature: 'test-signature',
}
const render = () => renderToStaticMarkup(
  <BillingSection tenantId="trial-company" companyName="Trial company" />,
)
const choose = () => {
  const props = button.mock.calls.find(([props]) => props.children === 'Elegir Autónomo')?.[0]
  expect(props).toBeDefined()
  props.onPress()
}

describe('BillingSection payment recovery', () => {
  let busy: string | null
  let error: string
  let page: EventTarget

  beforeEach(() => {
    vi.resetAllMocks()
    busy = null
    error = ''
    page = new EventTarget()
    vi.stubGlobal('window', page)
    setBusy.mockImplementation((value: string | null) => { busy = value })
    setError.mockImplementation((value: string) => { error = value })
    state.mockImplementation((initial: unknown) => {
      if (initial === null) return [busy, setBusy]
      if (initial === '') return [error, setError]
      if (typeof initial === 'function') return [null, vi.fn()]
      return [initial, vi.fn()]
    })
    button.mockImplementation(({ children, isDisabled }: { children: React.ReactNode; isDisabled?: boolean }) => (
      <button disabled={isDisabled}>{children}</button>
    ))
    invalidate.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('disables the chosen plan during checkout and releases it after the payment handoff', async () => {
    let finish: (result: BillingResult) => void = () => { }
    checkout.mockReturnValue(new Promise<BillingResult>((resolve) => { finish = resolve }))
    render()
    choose()
    expect(busy).toBe('solo')

    button.mockClear()
    render()
    const pending = button.mock.calls.find(([props]) => props.children === 'Elegir Autónomo')?.[0]
    expect(pending.isDisabled).toBe(true)

    finish({ ok: true, form })
    await vi.waitFor(() => expect(busy).toBeNull())
    expect(submit).toHaveBeenCalledWith(form)
    expect(checkout).toHaveBeenCalledWith('trial-company', 'solo', 'year')
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
    submit.mockImplementation(() => { throw new Error('Navigation failed') })
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