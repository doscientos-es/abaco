import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

import Stripe from 'stripe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc }) }))

import handler from '../../api/stripe_connect_webhook'

const event = {
  id: 'evt_ABC123',
  object: 'event',
  account: 'acct_ABC123',
  livemode: false,
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_ABC123' } },
}
const payload = JSON.stringify(event)
const signature = new Stripe('sk_test_placeholder').webhooks.generateTestHeaderString({
  payload,
  secret: 'whsec_test_only',
})

async function send(body: string, header = signature) {
  const request = Object.assign(Readable.from([Buffer.from(body)]), {
    method: 'POST',
    headers: { 'stripe-signature': header },
  }) as unknown as IncomingMessage
  const response = {
    statusCode: 0,
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse
  await handler(request, response)
  return response
}

describe('Connect webhook endpoint', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_placeholder')
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'whsec_test_only')
    vi.stubEnv('STRIPE_CONNECT_MODE', 'test')
    vi.stubEnv('SUPABASE_URL', 'https://example.test')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only')
    rpc.mockReset().mockResolvedValue({ error: null })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('stores the verified event before returning success', async () => {
    const response = await send(payload)
    expect(response.statusCode).toBe(200)
    expect(rpc).toHaveBeenCalledWith('receive_stripe_connect_event', { p_event: event })
  })

  it('rejects an altered body without storing it', async () => {
    expect((await send(`${payload} `)).statusCode).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('asks Stripe to retry if persistence fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'unavailable' } })
    expect((await send(payload)).statusCode).toBe(503)
  })

  it('fails closed without configuration or for an oversized request', async () => {
    vi.stubEnv('STRIPE_CONNECT_MODE', '')
    expect((await send(payload)).statusCode).toBe(503)
    vi.stubEnv('STRIPE_CONNECT_MODE', 'test')
    expect((await send('a'.repeat(1024 * 1024 + 1))).statusCode).toBe(413)
    expect(rpc).not.toHaveBeenCalled()
  })
})
