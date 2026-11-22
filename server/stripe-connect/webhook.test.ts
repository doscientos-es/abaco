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
  it('accepts the original body with a valid Stripe signature', () => {
    const { body, signature } = signed(event)
    expect(verifyConnectEvent(body, signature, config)).toMatchObject(event)
  })

  it('rejects a changed body, wrong secret and missing signature', () => {
    const { body, signature } = signed(event)
    expect(() => verifyConnectEvent(Buffer.from(`${body} `), signature, config)).toThrow()
    expect(() =>
      verifyConnectEvent(body, signature, { ...config, webhookSecret: 'whsec_other' }),
    ).toThrow()
    expect(() => verifyConnectEvent(body, '', config)).toThrow()
  })

  it('rejects a replay outside the SDK signature tolerance', () => {
    const { body, signature } = signed(event, Math.floor(Date.now() / 1000) - 301)
    expect(() => verifyConnectEvent(body, signature, config)).toThrow()
  })

  it.each([
    { ...event, livemode: true },
    { ...event, account: undefined },
    { ...event, account: 'acct_ABC/other' },
    { ...event, id: 'invalid' },
    { ...event, object: 'checkout.session' },
    { ...event, data: null },
  ])('rejects a signed event outside the expected Connect context', (candidate) => {
    const { body, signature } = signed(candidate)
    expect(() => verifyConnectEvent(body, signature, config)).toThrow()
  })
})
