import { matchPaidCheckout, type ExpectedPayment } from './checkout'

type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null
}

export interface StripePaymentStore {
  /** Look up the server-created reservation, never payment data supplied by a browser. */
  findReservation(operationId: string): Promise<ExpectedPayment | null>
  /**
   * In one transaction, revalidate the reservation and event, issue the invoice, record the
   * payment and queue notifications. Repeated events/payment intents must not issue twice.
   */
  settlePayment(eventId: string, expected: ExpectedPayment, paymentIntent: string): Promise<void>
}

/** Process only previously verified, durably stored Connect events. */
export async function processConnectPayment(
  event: unknown,
  store: StripePaymentStore,
): Promise<'settled' | 'ignored'> {
  const envelope = object(event)
  if (!envelope || typeof envelope.id !== 'string' || !/^evt_[a-zA-Z0-9]+$/.test(envelope.id))
    throw new Error('Invalid stored Stripe event')
  if (
    envelope.type !== 'checkout.session.completed' &&
    envelope.type !== 'checkout.session.async_payment_succeeded'
  )
    return 'ignored'

  const session = object(object(envelope.data)?.object)
  if (envelope.type === 'checkout.session.completed' && session?.payment_status === 'unpaid')
    return 'ignored'
  const operationId = object(session?.metadata)?.operation_id
  if (
    typeof operationId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)
  )
    throw new Error('Invalid Stripe payment operation')
  const expected = await store.findReservation(operationId)
  // The webhook can arrive before the checkout session has been persisted: retry, never discard.
  if (!expected) throw new Error('Stripe payment reservation unavailable')
  const paymentIntent = matchPaidCheckout(event, expected)
  if (!paymentIntent) throw new Error('Stripe payment does not match reservation')
  await store.settlePayment(envelope.id, expected, paymentIntent)
  return 'settled'
}
