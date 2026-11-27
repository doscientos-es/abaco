import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'

import { verifyConnectEvent } from './webhook'

const config = {
  secretKey: 'sk_test_placeholder',
  webhookSecret: 'whsec_test_only',
  liveMode: false,
}
const stripe = new Stripe(config.secretKey)
const event = {
  id: 'evt_ABC123',
  object: 'event',
  account: 'acct_ABC123',
  livemode: false,
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_ABC123' } },
}

function signed(value: unknown, timestamp?: number) {
  const body = JSON.stringify(value)
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: config.webhookSecret,
    ...(timestamp === undefined ? {} : { timestamp }),
  })
  return { body: Buffer.from(body), signature }
}

describe('Stripe Connect webhook verification', () => {
  it('accepts the original body with a valid Stripe signature', async () => {
    const { body, signature } = signed(event)
    await expect(verifyConnectEvent(body, signature, config)).resolves.toMatchObject(event)
  })

  it('rejects a changed body, wrong secret and missing signature', async () => {
    const { body, signature } = signed(event)
    await expect(
      verifyConnectEvent(Buffer.concat([body, Buffer.from(' ')]), signature, config),
    ).rejects.toThrow()
    await expect(
      verifyConnectEvent(body, signature, { ...config, webhookSecret: 'whsec_other' }),
    ).rejects.toThrow()
    await expect(verifyConnectEvent(body, '', config)).rejects.toThrow()
  })

  it('rejects a replay outside the SDK signature tolerance', async () => {
    const { body, signature } = signed(event, Math.floor(Date.now() / 1000) - 301)
    await expect(verifyConnectEvent(body, signature, config)).rejects.toThrow()
  })

  it.each([
    { ...event, livemode: true },
    { ...event, account: undefined },
    { ...event, account: 'acct_ABC/other' },
    { ...event, id: 'invalid' },
    { ...event, object: 'checkout.session' },
    { ...event, data: null },
  ])('rejects a signed event outside the expected Connect context', async (candidate) => {
    const { body, signature } = signed(candidate)
    await expect(verifyConnectEvent(body, signature, config)).rejects.toThrow()
  })
})
