const accountIdPattern = /^acct_[a-zA-Z0-9]+$/
const sessionIdPattern = /^cs_(?:test|live)_[a-zA-Z0-9]+$/
const paymentIntentPattern = /^pi_[a-zA-Z0-9]+$/
const operationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type JsonObject = Record<string, unknown>

function matchesSessionMode(sessionId: string, liveMode: boolean): boolean {
  return (
    sessionIdPattern.test(sessionId) && sessionId.startsWith(liveMode ? 'cs_live_' : 'cs_test_')
  )
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null
}

export type CheckoutRequest = {
  accountId: string
  operationId: string
  amountCents: number
  description: string
  successUrl: string
  cancelUrl: string
}

export type StripeConfig = {
  secretKey: string
  appOrigin: string
  liveMode: boolean
}

function validReturnUrl(value: string, appOrigin: string): boolean {
  try {
    const url = new URL(value)
    const origin = new URL(appOrigin)
    return (
      origin.protocol === 'https:' &&
      origin.origin === appOrigin &&
      url.origin === origin.origin &&
      !url.username &&
      !url.password &&
      !url.hash
    )
  } catch {
    return false
  }
}

async function stripeRequest(
  path: string,
  config: StripeConfig,
  fetcher: typeof fetch,
  options: { accountId?: string; operationId?: string; body?: URLSearchParams } = {},
): Promise<JsonObject> {
  const headers = new Headers({ Authorization: `Bearer ${config.secretKey}` })
  if (options.accountId) headers.set('Stripe-Account', options.accountId)
  if (options.operationId) headers.set('Idempotency-Key', options.operationId)
  if (options.body) headers.set('Content-Type', 'application/x-www-form-urlencoded')
  const response = await fetcher(`https://api.stripe.com/v1/${path}`, {
    method: options.body ? 'POST' : 'GET',
    headers,
    ...(options.body ? { body: options.body } : {}),
  })
  if (!response.ok) throw new Error('Stripe request failed')
  const payload: unknown = await response.json()
  const result = object(payload)
  if (!result) throw new Error('Invalid Stripe response')
  return result
}

/** Inputs must come from a durable, server-side payment reservation, never from the browser. */
export async function createDirectCheckout(
  input: CheckoutRequest,
  config: StripeConfig,
  fetcher: typeof fetch = fetch,
): Promise<{ sessionId: string; url: string }> {
  if (
    !config.secretKey ||
    !accountIdPattern.test(input.accountId) ||
    !operationIdPattern.test(input.operationId) ||
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    !input.description.trim() ||
    input.description.length > 200 ||
    !validReturnUrl(input.successUrl, config.appOrigin) ||
    !validReturnUrl(input.cancelUrl, config.appOrigin)
  )
    throw new Error('Invalid checkout request')

  const account = await stripeRequest(`accounts/${input.accountId}`, config, fetcher)
  const controller = object(account.controller)
  const fees = object(controller?.fees)
  const capabilities = object(account.capabilities)
  if (
    account.id !== input.accountId ||
    account.charges_enabled !== true ||
    fees?.payer !== 'account' ||
    capabilities?.card_payments !== 'active'
  )
    throw new Error('Connected account cannot accept direct charges with tenant-paid fees')

  const body = new URLSearchParams({
    mode: 'payment',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.operationId,
    'metadata[operation_id]': input.operationId,
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(input.amountCents),
    'line_items[0][price_data][product_data][name]': input.description,
    'line_items[0][quantity]': '1',
  })
  const session = await stripeRequest('checkout/sessions', config, fetcher, {
    accountId: input.accountId,
    operationId: input.operationId,
    body,
  })
  let url: URL
  try {
    url = new URL(typeof session.url === 'string' ? session.url : '')
  } catch {
    throw new Error('Invalid Stripe Checkout URL')
  }
  if (
    typeof session.id !== 'string' ||
    !matchesSessionMode(session.id, config.liveMode) ||
    session.livemode !== config.liveMode ||
    url.origin !== 'https://checkout.stripe.com' ||
    url.username ||
    url.password
  )
    throw new Error('Invalid Stripe Checkout response')
  return { sessionId: session.id, url: url.toString() }
}

export type ExpectedPayment = {
  accountId: string
  operationId: string
  sessionId: string
  amountCents: number
  liveMode: boolean
}

function validExpectedPayment(expected: ExpectedPayment): boolean {
  return (
    accountIdPattern.test(expected.accountId) &&
    operationIdPattern.test(expected.operationId) &&
    matchesSessionMode(expected.sessionId, expected.liveMode) &&
    Number.isSafeInteger(expected.amountCents) &&
    expected.amountCents > 0
  )
}

function matchPaidSession(value: unknown, expected: ExpectedPayment): string | null {
  const session = object(value)
  const metadata = object(session?.metadata)
  if (
    !validExpectedPayment(expected) ||
    session?.id !== expected.sessionId ||
    session.object !== 'checkout.session' ||
    session.livemode !== expected.liveMode ||
    session.mode !== 'payment' ||
    session.payment_status !== 'paid' ||
    session.currency !== 'eur' ||
    session.amount_total !== expected.amountCents ||
    session.client_reference_id !== expected.operationId ||
    metadata?.operation_id !== expected.operationId ||
    typeof session.payment_intent !== 'string' ||
    !paymentIntentPattern.test(session.payment_intent)
  )
    return null
  return session.payment_intent
}

/** Call only after verifying the webhook signature with Stripe's official SDK. */
export function matchPaidCheckout(event: unknown, expected: ExpectedPayment): string | null {
  const envelope = object(event)
  if (
    envelope?.account !== expected.accountId ||
    envelope.livemode !== expected.liveMode ||
    !['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(
      String(envelope.type),
    )
  )
    return null
  return matchPaidSession(object(envelope.data)?.object, expected)
}

/** Reconcile a durable reservation using Stripe's API in the connected account's context. */
export async function retrievePaidCheckout(
  expected: ExpectedPayment,
  config: StripeConfig,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  if (!config.secretKey || config.liveMode !== expected.liveMode || !validExpectedPayment(expected))
    throw new Error('Invalid payment reservation')

  const session = await stripeRequest(`checkout/sessions/${expected.sessionId}`, config, fetcher, {
    accountId: expected.accountId,
  })
  return matchPaidSession(session, expected)
}
