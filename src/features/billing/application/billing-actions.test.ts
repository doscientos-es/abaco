import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  describeSubscription,
  paymentsQuery,
  referralOverviewQuery,
  subscriptionQuery,
} from './billing-actions'

const { from, rpc, request } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  request: {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    returns: vi.fn(),
    abortSignal: vi.fn(),
    single: vi.fn(),
  },
}))

vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ from, rpc }),
}))

describe('describeSubscription', () => {
  const expired = {
    plan: 'business',
    subscription_status: 'trialing',
    trial_ends_at: '2020-01-01T00:00:00Z',
    billing_interval: null,
    current_period_end: null,
    cancel_at_period_end: false,
    next_plan: null,
    next_interval: null,
  }

  it('allows an expired courtesy tenant to write without reporting trial days', () => {
    expect(describeSubscription({ ...expired, is_complimentary: true })).toMatchObject({
      isComplimentary: true,
      canWrite: true,
      trialDaysLeft: 0,
    })
    expect(describeSubscription({ ...expired, is_complimentary: false }).canWrite).toBe(false)
  })

  it('continues to load legacy subscriptions before the courtesy migration', async () => {
    from.mockReturnValue(request)
    request.select.mockReturnValue(request)
    request.eq.mockReturnValue(request)
    request.single
      .mockResolvedValueOnce({
        data: null,
        error: { code: '42703', message: 'column is_complimentary does not exist' },
      })
      .mockResolvedValueOnce({ data: expired, error: null })
    const client = new QueryClient()
    await expect(client.fetchQuery(subscriptionQuery('legacy'))).resolves.toMatchObject({
      isComplimentary: false,
      canWrite: false,
    })
    client.clear()
  })
})

describe('paymentsQuery', () => {
  let client: QueryClient

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    client = new QueryClient()
    from.mockReturnValue(request)
    request.select.mockReturnValue(request)
    request.eq.mockReturnValue(request)
    request.order.mockReturnValue(request)
    request.returns.mockReturnValue(request)
  })

  afterEach(() => {
    client.clear()
    vi.useRealTimers()
  })

  it('returns an empty history for a company with no payments', async () => {
    request.abortSignal.mockResolvedValue({ data: [], error: null })

    await expect(client.fetchQuery(paymentsQuery('trial-company'))).resolves.toEqual([])
    expect(from).toHaveBeenCalledWith('billing_payments')
    expect(request.eq).toHaveBeenCalledWith('tenant_id', 'trial-company')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('maps payments and preserves their dates and status', async () => {
    request.abortSignal.mockResolvedValue({
      data: [
        {
          id: 'payment-1',
          merchant_order: '1234ABCD',
          kind: 'first',
          plan: 'solo',
          period: 'month',
          amount_cents: 2420,
          charge_cents: 2420,
          referral_credit_cents: 0,
          net_cents: 2000,
          vat_percent: 21,
          invoice_number: null,
          invoice_portal_url: null,
          status: 'succeeded',
          created_at: '2026-10-14T10:00:00Z',
          settled_at: '2026-10-14T10:01:00Z',
        },
      ],
      error: null,
    })

    await expect(client.fetchQuery(paymentsQuery('paid-company'))).resolves.toEqual([
      {
        id: 'payment-1',
        order: '1234ABCD',
        kind: 'first',
        plan: 'solo',
        period: 'month',
        amountCents: 2420,
        chargedCents: 2420,
        referralCreditCents: 0,
        netCents: 2000,
        vatPercent: 21,
        invoiceNumber: null,
        invoicePortalUrl: null,
        status: 'succeeded',
        createdAt: new Date('2026-10-14T10:00:00Z'),
        settledAt: new Date('2026-10-14T10:01:00Z'),
      },
    ])
  })

  it('loads payments when referral columns are absent without inventing a payment breakdown', async () => {
    request.abortSignal
      .mockResolvedValueOnce({
        data: null,
        error: { code: '42703', message: 'column billing_payments.charge_cents does not exist' },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'p',
            merchant_order: '1234TEST',
            kind: 'first',
            plan: 'solo',
            period: 'month',
            amount_cents: 2420,
            net_cents: 2000,
            vat_percent: 21,
            status: 'succeeded',
            created_at: '2026-10-14T10:00:00Z',
            settled_at: null,
            invoice_number: null,
            invoice_portal_url: null,
          },
        ],
        error: null,
      })
    const result = await client.fetchQuery(paymentsQuery('legacy'))
    expect(result[0]).toMatchObject({
      amountCents: 2420,
      chargedCents: null,
      referralCreditCents: null,
    })
    expect(request.select).toHaveBeenCalledTimes(2)
    expect(request.select.mock.calls[1]?.[0]).not.toContain('charge_cents')
  })

  it('stops a stalled request after 15 seconds and permits a fresh retry', async () => {
    request.abortSignal.mockReturnValue(new Promise(() => {}))
    const pending = client.fetchQuery(paymentsQuery('trial-company'))
    const failed = expect(pending).rejects.toThrow('No se pudo cargar el historial de pagos.')
    const signal = request.abortSignal.mock.calls[0]?.[0] as AbortSignal

    await vi.advanceTimersByTimeAsync(15_000)
    await failed
    expect(signal.aborted).toBe(true)
    expect(from).toHaveBeenCalledTimes(1)

    request.abortSignal.mockResolvedValue({ data: [], error: null })
    await expect(client.fetchQuery(paymentsQuery('trial-company'))).resolves.toEqual([])
    const retrySignal = request.abortSignal.mock.calls[1]?.[0] as AbortSignal
    expect(retrySignal.aborted).toBe(false)
  })

  it('does not turn a database failure into an empty history', async () => {
    request.abortSignal.mockResolvedValue({ data: null, error: { message: 'Unavailable' } })

    await expect(client.fetchQuery(paymentsQuery('trial-company'))).rejects.toThrow(
      'No se pudo cargar el historial de pagos.',
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('forwards query cancellation to the request', async () => {
    request.abortSignal.mockReturnValue(new Promise(() => {}))
    const pending = client.fetchQuery(paymentsQuery('trial-company')).catch(() => {})
    const signal = request.abortSignal.mock.calls[0]?.[0] as AbortSignal

    await client.cancelQueries({ queryKey: ['billing-payments', 'trial-company'] })
    await pending
    expect(signal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(15_000)
  })
})

describe('referralOverviewQuery', () => {
  it('loads the attribution status without fabricating a discount balance', async () => {
    const summary = {
      code: 'AB12CD34EF56AB78',
      referred_count: 2,
      recommended_by: null,
      rewards_active: false,
    }
    rpc.mockResolvedValue({ data: summary, error: null })
    const client = new QueryClient()
    await expect(client.fetchQuery(referralOverviewQuery('tenant'))).resolves.toEqual(summary)
    expect(rpc).toHaveBeenCalledWith('referral_program_status', { p_tenant: 'tenant' })
    client.clear()
  })

  it('reports an unavailable program when the server has no referral function', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
    const client = new QueryClient()
    await expect(client.fetchQuery(referralOverviewQuery('tenant'))).resolves.toBeNull()
    client.clear()
  })
  it('does not hide other server failures', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await expect(client.fetchQuery(referralOverviewQuery('tenant'))).rejects.toThrow(
      'No se pudo cargar el estado de referidos.',
    )
    client.clear()
  })
})
