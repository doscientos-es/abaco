import type Stripe from 'stripe'

import { verifyConnectEvent } from './webhook'

export type WebhookConfig = { secretKey: string; webhookSecret: string; liveMode: boolean }

export interface ConnectEventStore {
  /** Persist or deduplicate the verified event atomically before acknowledging Stripe. */
  enqueue(event: Stripe.Event): Promise<void>
}

export async function receiveConnectEvent(
  body: Buffer,
  signature: string,
  config: WebhookConfig,
  store: ConnectEventStore,
): Promise<'accepted' | 'invalid' | 'unavailable'> {
  if (!config.secretKey || !config.webhookSecret) return 'unavailable'
  let event: Stripe.Event
  try {
    event = verifyConnectEvent(body, signature, config)
  } catch {
    return 'invalid'
  }
  try {
    await store.enqueue(event)
    return 'accepted'
  } catch {
    // Never acknowledge an event that has not been durably saved for processing.
    return 'unavailable'
  }
}
