import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), membership: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: mocks.rpc,
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.membership }) }) }),
    }),
  }),
}))

import authorize from '../../api/stripe_connect_authorize'
import callback from '../../api/stripe_connect_callback'

const tenantId = 'bd000000-0000-4000-8000-000000000001'
const userId = 'bd000000-0000-4000-8000-000000000002'

async function request(
  handler: typeof authorize,
  method: string,
  headers: Record<string, string>,
  body = '',
  url = '/',
) {
  const req = Object.assign(Readable.from(body ? [Buffer.from(body)] : []), {
    method,
    headers,
    url,
  })
  const response = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() }
  await handler(req as unknown as IncomingMessage, response as unknown as ServerResponse)
  const header = (name: string) =>
    response.setHeader.mock.calls.find(([key]) => key === name)?.[1] as string | undefined
  return { ...response, header }
}

describe('Stripe OAuth HTTP endpoints', () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries({
      STRIPE_CLIENT_ID: 'ca_ABC123',
      STRIPE_SECRET_KEY: 'test-only',
      STRIPE_CONNECT_MODE: 'test',
      SUPABASE_URL: 'https://example.test',
      SUPABASE_SERVICE_ROLE_KEY: 'test-only',
      APP_ORIGIN: 'https://app.example.test',
    }))
      vi.stubEnv(key, value)
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null })
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: userId } }, error: null })
    mocks.membership.mockReset().mockResolvedValue({ data: { role: 'admin' }, error: null })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('binds the authorization callback to the initiating browser and tenant', async () => {
    const start = await request(
      authorize,
      'POST',
      {
        origin: 'https://app.example.test',
        authorization: 'Bearer test-only',
      },
      JSON.stringify({ tenantId }),
    )
    expect(start.statusCode).toBe(200)
    const cookie = start.header('Set-Cookie') ?? ''
    expect(cookie).toContain('HttpOnly; Secure; SameSite=Lax')
    const state = /__Host-stripe_connect_state=([^;]+)/.exec(cookie)?.[1] ?? ''
    expect(state).toHaveLength(43)
    const hash = createHash('sha256').update(state).digest('base64url')
    expect(mocks.rpc).toHaveBeenCalledWith(
      'save_stripe_connect_oauth_state',
      expect.objectContaining({
        p_state_hash: hash,
        p_tenant_id: tenantId,
        p_user_id: userId,
      }),
    )
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            stripe_user_id: 'acct_ABC123',
            scope: 'read_write',
            livemode: false,
          }),
        ),
    )
    vi.stubGlobal('fetch', fetcher)
    mocks.rpc
      .mockResolvedValueOnce({
        data: { tenantId, userId, expiresAt: Date.now() + 60000 },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null })
    const finish = await request(
      callback,
      'GET',
      { cookie: cookie.split(';')[0] ?? '' },
      '',
      `/api/stripe_connect_callback?state=${state}&code=ac_CODE1`,
    )
    expect(finish.statusCode).toBe(303)
    expect(finish.header('Location')).toBe(
      'https://app.example.test/ajustes?tab=integraciones&stripe=connected',
    )
    expect(mocks.rpc).toHaveBeenCalledWith('consume_stripe_connect_oauth_state', {
      p_state_hash: hash,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('save_stripe_connect_account', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_account_id: 'acct_ABC123',
      p_livemode: false,
    })
    expect(finish.header('Set-Cookie')).toContain('Max-Age=0')
  })

  it('rejects cross-origin requests, non-admins and callbacks without the original cookie', async () => {
    expect((await request(authorize, 'POST', { origin: 'https://evil.example' })).statusCode).toBe(
      403,
    )
    mocks.membership.mockResolvedValue({ data: { role: 'viewer' }, error: null })
    const forbidden = await request(
      authorize,
      'POST',
      {
        origin: 'https://app.example.test',
        authorization: 'Bearer test-only',
      },
      JSON.stringify({ tenantId }),
    )
    expect(forbidden.statusCode).toBe(403)
    const result = await request(
      callback,
      'GET',
      {},
      '',
      `/api/stripe_connect_callback?state=${'A'.repeat(43)}&code=ac_CODE1`,
    )
    expect(result.header('Location')).toContain('stripe=error')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('reports only the authorized tenant connection in the configured mode', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null })
    const result = await request(
      authorize,
      'POST',
      { origin: 'https://app.example.test', authorization: 'Bearer test-only' },
      JSON.stringify({ tenantId, action: 'status' }),
    )
    expect(result.statusCode).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('stripe_connect_account_exists', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_livemode: false,
    })
    expect(result.end).toHaveBeenCalledWith(expect.stringContaining('"connected":true'))
  })

  it('does not clear the pending state cookie for an unrelated callback', async () => {
    const result = await request(
      callback,
      'GET',
      { cookie: `__Host-stripe_connect_state=${'A'.repeat(43)}` },
      '',
      `/api/stripe_connect_callback?state=${'B'.repeat(43)}&code=ac_CODE1`,
    )
    expect(result.header('Location')).toContain('stripe=error')
    expect(result.header('Set-Cookie')).toBeUndefined()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
