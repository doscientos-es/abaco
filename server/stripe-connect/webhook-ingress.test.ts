import Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'

import { receiveConnectEvent } from './webhook-ingress'

const config = {
  secretKey: 'sk_test_placeholder',
  webhookSecret: 'whsec_test_only',
  liveMode: false,
}
const event = {
  id: 'evt_ABC123',
  object: 'event',
  account: 'acct_ABC123',
  livemode: false,
  type: 'charge.refunded',
  data: { object: { id: 'ch_ABC123' } },
}
const body = Buffer.from(JSON.stringify(event))
const signature = new Stripe(config.secretKey).webhooks.generateTestHeaderString({
  payload: body.toString(),
  secret: config.webhookSecret,
})

describe('Connect webhook ingress', () => {
  it('persists a verified event, including events requiring later reconciliation', async () => {
    const store = { enqueue: vi.fn(async () => {}) }
    expect(await receiveConnectEvent(body, signature, config, store)).toBe('accepted')
    expect(store.enqueue).toHaveBeenCalledOnce()
    expect(store.enqueue).toHaveBeenCalledWith(event)
  })

  it('never persists an invalid signature or unconfigured request', async () => {
    const store = { enqueue: vi.fn(async () => {}) }
    expect(await receiveConnectEvent(body, 'invalid', config, store)).toBe('invalid')
    expect(
      await receiveConnectEvent(body, signature, { ...config, webhookSecret: '' }, store),
    ).toBe('unavailable')
    expect(store.enqueue).not.toHaveBeenCalled()
  })

  it('does not acknowledge events when durable storage fails', async () => {
    const store = {
      enqueue: vi.fn(async () => {
        throw new Error('Database unavailable')
      }),
    }
    expect(await receiveConnectEvent(body, signature, config, store)).toBe('unavailable')
  })
})
