import Stripe from 'stripe'

const accountIdPattern = /^acct_[a-zA-Z0-9]+$/
const eventIdPattern = /^evt_[a-zA-Z0-9]+$/

/** Verify the unmodified request body before inspecting or storing a Connect event. */
export function verifyConnectEvent(
  body: Buffer,
  signature: string,
  config: { secretKey: string; webhookSecret: string; liveMode: boolean },
): Stripe.Event {
  if (!body.length || !signature || !config.secretKey || !config.webhookSecret)
    throw new Error('Stripe webhook not configured or invalid')

  const stripe = new Stripe(config.secretKey)
  const event = stripe.webhooks.constructEvent(body, signature, config.webhookSecret)
  if (
    event.object !== 'event' ||
    !eventIdPattern.test(event.id) ||
    typeof event.account !== 'string' ||
    !accountIdPattern.test(event.account) ||
    event.livemode !== config.liveMode ||
    !event.type ||
    !event.data ||
    !event.data.object
  )
    throw new Error('Invalid Stripe Connect event')
  return event
}
