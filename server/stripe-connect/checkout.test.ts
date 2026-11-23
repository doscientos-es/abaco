import { describe, expect, it, vi } from 'vitest'

import { createDirectCheckout, matchPaidCheckout, retrievePaidCheckout } from './checkout'

const request = {
  accountId: 'acct_ABC123',
  operationId: 'bd000000-0000-4000-8000-000000000001',
  amountCents: 12500,
  description: 'Señal del presupuesto',
  successUrl: 'https://app.example.test/presupuesto/return',
  cancelUrl: 'https://app.example.test/presupuesto/cancel',
}
const config = {
  secretKey: 'test-only-key',
  appOrigin: 'https://app.example.test',
  liveMode: false,
}
const account = {
  id: request.accountId,
  charges_enabled: true,
  controller: { fees: { payer: 'account' } },
  capabilities: { card_payments: 'active' },
}
const checkout = {
  id: 'cs_test_ABC123',
  livemode: false,
  url: 'https://checkout.stripe.com/c/pay/test',
}

function response(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200 })
}

function fakeStripe(accountData: unknown = account, sessionData: unknown = checkout) {
  return vi.fn<typeof fetch>(async (url) =>
    response(
      typeof url === 'string' && url.endsWith('/checkout/sessions') ? sessionData : accountData,
    ),
  )
}

describe('Stripe direct Checkout', () => {
  it('checks the tenant pays Stripe fees and creates a direct charge without an application fee', async () => {
    const fetcher = fakeStripe()
    await expect(createDirectCheckout(request, config, fetcher)).resolves.toEqual({
      sessionId: checkout.id,
      url: checkout.url,
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    const call = fetcher.mock.calls[1]
    if (!call) throw new Error('Checkout was not requested')
    const [url, init] = call
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions')
    const headers = new Headers(init?.headers)
    expect(headers.get('Stripe-Account')).toBe(request.accountId)
    expect(headers.get('Idempotency-Key')).toBe(request.operationId)
    const body = init?.body as URLSearchParams
    expect(body.get('line_items[0][price_data][unit_amount]')).toBe('12500')
    expect(body.get('line_items[0][price_data][currency]')).toBe('eur')
    expect(body.get('client_reference_id')).toBe(request.operationId)
    expect(body.get('metadata[operation_id]')).toBe(request.operationId)
    expect([...body.keys()].some((key) => key.includes('application_fee'))).toBe(false)
  })

  it.each([
    { ...account, charges_enabled: false },
    { ...account, id: 'acct_OTHER' },
    { ...account, controller: { fees: { payer: 'application' } } },
    { ...account, capabilities: { card_payments: 'pending' } },
  ])('does not create a payment for an ineligible connected account', async (accountData) => {
    const fetcher = fakeStripe(accountData)
    await expect(createDirectCheckout(request, config, fetcher)).rejects.toThrow(
      'Connected account',
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([
    { amountCents: 0 },
    { amountCents: 0.1 },
    { amountCents: Number.MAX_SAFE_INTEGER + 1 },
    { accountId: 'acct_ABC/other' },
    { successUrl: 'https://attacker.example/return' },
    { cancelUrl: 'https://app.example.test@attacker.example/' },
  ])('rejects invalid input before calling Stripe', async (patch) => {
    const fetcher = fakeStripe()
    await expect(createDirectCheckout({ ...request, ...patch }, config, fetcher)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    { ...checkout, url: 'https://attacker.example/' },
    { ...checkout, livemode: true },
    { ...checkout, id: 'cs_invalid' },
    { ...checkout, id: 'cs_live_ABC123' },
  ])('rejects a malformed or mismatched Checkout response', async (session) => {
    await expect(
      createDirectCheckout(request, config, fakeStripe(account, session)),
    ).rejects.toThrow()
  })
})

const expected = {
  accountId: request.accountId,
  operationId: request.operationId,
  sessionId: checkout.id,
  amountCents: request.amountCents,
  liveMode: false,
}
const session = {
  id: checkout.id,
  object: 'checkout.session',
  livemode: false,
  mode: 'payment',
  payment_status: 'paid',
  currency: 'eur',
  amount_total: request.amountCents,
  client_reference_id: request.operationId,
  metadata: { operation_id: request.operationId },
  payment_intent: 'pi_ABC123',
}
const event = {
  type: 'checkout.session.completed',
  account: request.accountId,
  livemode: false,
  data: { object: session },
}

describe('matching a verified Stripe event to a reserved payment', () => {
  it('accepts a paid session and the equivalent delayed payment event', () => {
    expect(matchPaidCheckout(event, expected)).toBe('pi_ABC123')
    expect(
      matchPaidCheckout({ ...event, type: 'checkout.session.async_payment_succeeded' }, expected),
    ).toBe('pi_ABC123')
  })

  it('rejects a live session identifier in test mode even when all fields match', () => {
    const liveSession = { ...session, id: 'cs_live_ABC123' }
    expect(
      matchPaidCheckout(
        { ...event, data: { object: liveSession } },
        { ...expected, sessionId: liveSession.id },
      ),
    ).toBeNull()
  })

  it.each([
    { ...event, account: 'acct_OTHER' },
    { ...event, livemode: true },
    { ...event, type: 'checkout.session.expired' },
    { ...event, data: { object: { ...session, id: 'cs_test_OTHER' } } },
    { ...event, data: { object: { ...session, payment_status: 'unpaid' } } },
    { ...event, data: { object: { ...session, amount_total: 1 } } },
    { ...event, data: { object: { ...session, currency: 'usd' } } },
    { ...event, data: { object: { ...session, livemode: true } } },
    { ...event, data: { object: { ...session, metadata: { operation_id: 'other' } } } },
    { ...event, data: { object: { ...session, payment_intent: null } } },
    null,
  ])('rejects events not matching the exact paid transaction', (candidate) => {
    expect(matchPaidCheckout(candidate, expected)).toBeNull()
  })
})

describe('reconciling a Checkout session with Stripe', () => {
  it('reads the exact session using the connected account and validates the paid result', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(session))
    await expect(retrievePaidCheckout(expected, config, fetcher)).resolves.toBe('pi_ABC123')
    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions/cs_test_ABC123')
    expect(init?.method).toBe('GET')
    expect(new Headers(init?.headers).get('Stripe-Account')).toBe(expected.accountId)
  })

  it.each([
    { ...session, payment_status: 'unpaid' },
    { ...session, amount_total: 1 },
    { ...session, client_reference_id: 'different' },
    { ...session, currency: 'usd' },
  ])('does not confirm a pending or mismatched session', async (result) => {
    await expect(
      retrievePaidCheckout(
        expected,
        config,
        vi.fn<typeof fetch>(async () => response(result)),
      ),
    ).resolves.toBeNull()
  })

  it.each([
    { ...expected, accountId: 'acct_ABC/other' },
    { ...expected, sessionId: 'cs_test_ABC/other' },
    { ...expected, sessionId: 'cs_live_ABC123' },
    { ...expected, amountCents: 0 },
    { ...expected, liveMode: true },
  ])('rejects an invalid reservation before contacting Stripe', async (reservation) => {
    const fetcher = vi.fn<typeof fetch>(async () => response(session))
    await expect(retrievePaidCheckout(reservation, config, fetcher)).rejects.toThrow('reservation')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('propagates Stripe failures rather than treating them as payment', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }))
    await expect(retrievePaidCheckout(expected, config, fetcher)).rejects.toThrow('Stripe request')
  })
})
