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
  plan: 'trial', status: 'trialing', trialEndsAt: new Date('2026-11-01'),
  interval: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
  nextPlan: null, nextInterval: null, canWrite: true, trialDaysLeft: 18,
}

const render = () => renderToStaticMarkup(
  <PaymentHistory tenantId="trial-company" companyName="Trial company" subscription={subscription} />,
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