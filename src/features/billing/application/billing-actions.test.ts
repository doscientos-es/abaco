import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { paymentsQuery } from './billing-actions'

const { from, request } = vi.hoisted(() => ({
  from: vi.fn(),
  request: { select: vi.fn(), eq: vi.fn(), order: vi.fn(), abortSignal: vi.fn() },
}))

vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ from }),
}))

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
        status: 'succeeded',
        createdAt: new Date('2026-10-14T10:00:00Z'),
        settledAt: new Date('2026-10-14T10:01:00Z'),
      },
    ])
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
