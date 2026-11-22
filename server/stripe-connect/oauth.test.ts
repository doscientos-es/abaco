import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import {
  beginStripeAuthorization,
  completeStripeAuthorization,
  type StripeActor,
  type StripeOAuthStore,
} from './oauth'

const actor = {
  tenantId: 'bd000000-0000-4000-8000-000000000001',
  userId: 'bd000000-0000-4000-8000-000000000002',
}
const config = {
  clientId: 'ca_ABC123',
  secretKey: 'test-only-key',
  redirectUri: 'https://example.test/oauth/callback',
  liveMode: false,
}
const allowed = async () => true

function memoryStore() {
  const states = new Map<string, { actor: StripeActor; expiresAt: number }>()
  const saveConnection = vi.fn<StripeOAuthStore['saveConnection']>(async () => {})
  const store: StripeOAuthStore = {
    async saveState(hash, pendingActor, expiresAt) {
      states.set(hash, { actor: pendingActor, expiresAt })
    },
    async consumeState(hash) {
      const result = states.get(hash) ?? null
      states.delete(hash)
      return result
    },
    saveConnection,
  }
  return { store, states, saveConnection }
}

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      stripe_user_id: 'acct_ABC123',
      scope: 'read_write',
      livemode: false,
      ...overrides,
    }),
  )
}

describe('Stripe Connect authorization', () => {
  it('stores a hashed one-use state and connects only the authorizing tenant', async () => {
    const { store, states, saveConnection } = memoryStore()
    const url = new URL(await beginStripeAuthorization(actor, config, store, allowed, 1000))
    expect(url.origin).toBe('https://connect.stripe.com')
    expect(url.searchParams.get('scope')).toBe('read_write')
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri)
    const state = url.searchParams.get('state') ?? ''
    const hash = createHash('sha256').update(state).digest('base64url')
    expect(states.has(state)).toBe(false)
    expect(states.get(hash)?.actor).toEqual(actor)
    const fetcher = vi.fn<typeof fetch>(async () => tokenResponse())
    await expect(
      completeStripeAuthorization(state, 'ac_CODE1', config, store, allowed, fetcher, 2000),
    ).resolves.toEqual(actor)
    expect(saveConnection).toHaveBeenCalledWith(actor, 'acct_ABC123', false)
    await expect(
      completeStripeAuthorization(state, 'ac_CODE1', config, store, allowed, fetcher, 2000),
    ).rejects.toThrow('state')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('never exchanges an expired or unauthorized callback', async () => {
    const { store } = memoryStore()
    const url = new URL(await beginStripeAuthorization(actor, config, store, allowed, 1000))
    const state = url.searchParams.get('state') ?? ''
    const fetcher = vi.fn<typeof fetch>(async () => tokenResponse())
    await expect(
      completeStripeAuthorization(state, 'ac_CODE1', config, store, allowed, fetcher, 601000),
    ).rejects.toThrow('state')
    const next = new URL(await beginStripeAuthorization(actor, config, store, allowed, 1000))
    await expect(
      completeStripeAuthorization(
        next.searchParams.get('state') ?? '',
        'ac_CODE2',
        config,
        store,
        async () => false,
        fetcher,
        2000,
      ),
    ).rejects.toThrow('Not authorized')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([{ scope: 'read_only' }, { livemode: true }, { stripe_user_id: 'acct_ABC/other' }])(
    'does not persist a mismatched Stripe response',
    async (result) => {
      const { store, saveConnection } = memoryStore()
      const url = new URL(await beginStripeAuthorization(actor, config, store, allowed, 1000))
      const fetcher = vi.fn<typeof fetch>(async () => tokenResponse(result))
      await expect(
        completeStripeAuthorization(
          url.searchParams.get('state') ?? '',
          'ac_CODE1',
          config,
          store,
          allowed,
          fetcher,
          2000,
        ),
      ).rejects.toThrow('response')
      expect(saveConnection).not.toHaveBeenCalled()
    },
  )

  it('rejects unauthorized actors before creating a state', async () => {
    const { store, states } = memoryStore()
    await expect(beginStripeAuthorization(actor, config, store, async () => false)).rejects.toThrow(
      'Not authorized',
    )
    expect(states.size).toBe(0)
  })
})
