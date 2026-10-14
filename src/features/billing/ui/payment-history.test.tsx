import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Subscription } from '../application/billing-actions'

import { PaymentHistory } from './payment-history'

const { query, button } = vi.hoisted(() => ({ query: vi.fn(), button: vi.fn() }))

vi.mock('@tanstack/react-query', () => ({ useQuery: query }))
vi.mock('@doscientos/ui', () => ({ Button: button }))
vi.mock('../application/billing-actions', () => ({
  paymentsQuery: (tenantId: string) => ({ queryKey: ['billing-payments', tenantId] }),
}))

const subscription: Subscription = {
  plan: 'trial', status: 'trialing', trialEndsAt: new Date('2026-11-01T12:00:00Z'),
  interval: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
  nextPlan: null, nextInterval: null, canWrite: true, trialDaysLeft: 18,
}

const render = (currentSubscription: Subscription = subscription) => renderToStaticMarkup(
  <PaymentHistory tenantId="trial-company" companyName="Trial company" subscription={currentSubscription} />,
)

describe('PaymentHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    button.mockImplementation(({ children }: { children: ReactNode }) => <button>{children}</button>)
  })

  it('shows an empty trial history instead of loading', () => {
    query.mockReturnValue({ data: [], isPending: false, isError: false, fetchStatus: 'idle' })

    const html = render()
    expect(html).toContain('Todavía no has hecho ningún pago.')
    expect(html).not.toContain('Cargando…')
  })

  it('shows the trial end date without suggesting an automatic charge', () => {
    query.mockReturnValue({ data: [], isPending: false, isError: false, fetchStatus: 'idle' })

    const html = render()
    expect(html).toContain('Fin de la prueba gratuita')
    expect(html).toContain('1 de noviembre de 2026')
    expect(html).toContain('No se cobra automáticamente al terminar.')
    expect(html).not.toContain('Próximo cobro')
  })

  it('keeps the end date visible for an expired trial', () => {
    query.mockReturnValue({ data: [], isPending: false, isError: false, fetchStatus: 'idle' })

    const html = render({
      ...subscription,
      trialEndsAt: new Date('2026-10-01T12:00:00Z'),
      canWrite: false,
      trialDaysLeft: 0,
    })
    expect(html).toContain('Fin de la prueba gratuita')
    expect(html).toContain('1 de octubre de 2026')
    expect(html).not.toContain('Próximo cobro')
  })

  it('keeps the next charge and renewal date for a paid subscription', () => {
    query.mockReturnValue({ data: [], isPending: false, isError: false, fetchStatus: 'idle' })

    const html = render({
      ...subscription,
      plan: 'solo',
      status: 'active',
      interval: 'month',
      currentPeriodEnd: new Date('2026-12-01T12:00:00Z'),
    })
    expect(html).toContain('Próximo cobro')
    expect(html).toContain('24,20')
    expect(html).toContain('el 1 de diciembre de 2026')
    expect(html).not.toContain('Fin de la prueba gratuita')
    expect(html).not.toContain('No se cobra automáticamente al terminar.')
  })

  it('does not show a next charge for a subscription canceled at period end', () => {
    query.mockReturnValue({ data: [], isPending: false, isError: false, fetchStatus: 'idle' })

    const html = render({
      ...subscription,
      plan: 'solo',
      status: 'active',
      interval: 'month',
      currentPeriodEnd: new Date('2026-12-01T12:00:00Z'),
      cancelAtPeriodEnd: true,
    })
    expect(html).toContain('Próximo cobro')
    expect(html).toContain('Ninguno: termina el 1 de diciembre de 2026')
    expect(html).not.toContain('Fin de la prueba gratuita')
  })

  it('shows loading only while the initial request is pending', () => {
    query.mockReturnValue({ data: undefined, isPending: true, isError: false, fetchStatus: 'fetching' })

    expect(render()).toContain('Cargando…')
  })

  it('offers retry after an error without claiming there are no payments', () => {
    const refetch = vi.fn()
    query.mockReturnValue({ data: undefined, isPending: false, isError: true, fetchStatus: 'idle', refetch })

    const html = render()
    expect(html).toContain('No se pudo cargar el historial de pagos.')
    expect(html).toContain('Reintentar')
    expect(html).not.toContain('Cargando…')
    expect(html).not.toContain('Todavía no has hecho ningún pago.')
    button.mock.calls[0]?.[0].onPress()
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('explains an offline request instead of showing indefinite loading', () => {
    query.mockReturnValue({ data: undefined, isPending: true, isError: false, fetchStatus: 'paused' })

    const html = render()
    expect(html).toContain('Sin conexión.')
    expect(html).not.toContain('Cargando…')
  })
})