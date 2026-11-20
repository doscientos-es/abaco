import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import {
  beginCalendarAuthorization,
  calendarScope,
  completeCalendarAuthorization,
  decryptRefreshToken,
  encryptRefreshToken,
  refreshCalendarAccess,
  revokeCalendarAccess,
  type CalendarActor,
  type OAuthStore,
} from './oauth'

const actor = {
  tenantId: '5c000000-0000-4000-8000-000000000001',
  userId: '5c000000-0000-4000-8000-000000000002',
}
const config = {
  clientId: 'test-client',
  clientSecret: 'test-only-secret',
  redirectUri: 'https://app.example.test/calendar/callback',
  encryptionKey: Buffer.alloc(32, 7),
}
const allowed = async () => true

function memoryStore() {
  type Pending = Parameters<OAuthStore['saveState']>[1]
  const pending = new Map<string, Pending>()
  let token = ''
  const store: OAuthStore = {
    async saveState(hash, value) {
      pending.set(hash, value)
    },
    async consumeState(hash) {
      const value = pending.get(hash) ?? null
      pending.delete(hash)
      return value
    },
    async saveAuthorizedConnection(_actor, encrypted) {
      token = encrypted
    },
    async rotateRefreshToken(_actor, previous, next) {
      if (previous !== token) throw new Error('Credential changed')
      token = next
    },
  }
  return { store, saved: () => token }
}

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function begin(store: OAuthStore) {
  return new URL(await beginCalendarAuthorization(actor, config, store, allowed, 1000))
}

describe('server OAuth preparation', () => {
  it('uses minimum scope, offline access, state and PKCE; saves only an encrypted refresh token', async () => {
    const { store, saved } = memoryStore()
    const url = await begin(store)
    expect(url.searchParams.get('scope')).toBe(calendarScope)
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    const state = url.searchParams.get('state') ?? ''
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const body = init?.body as URLSearchParams
      const verifier = body.get('code_verifier') ?? ''
      expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
        url.searchParams.get('code_challenge'),
      )
      expect(body.get('redirect_uri')).toBe(config.redirectUri)
      return json({ refresh_token: 'refresh-test', scope: calendarScope })
    })
    await completeCalendarAuthorization(
      actor,
      state,
      'code-test',
      config,
      store,
      allowed,
      fetcher,
      2000,
    )
    expect(saved()).not.toContain('refresh-test')
    expect(decryptRefreshToken(saved(), config.encryptionKey, actor)).toBe('refresh-test')
    await expect(
      completeCalendarAuthorization(
        actor,
        state,
        'code-test',
        config,
        store,
        allowed,
        fetcher,
        2000,
      ),
    ).rejects.toThrow('state')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects state replay, expiry, wrong user or tenant, and revoked membership before exchange', async () => {
    for (const [callbackActor, now, authorize] of [
      [{ ...actor, userId: '5c000000-0000-4000-8000-000000000004' }, 2000, allowed],
      [{ ...actor, tenantId: '5c000000-0000-4000-8000-000000000004' }, 2000, allowed],
      [actor, 601000, allowed],
      [actor, 2000, async () => false],
    ] as [CalendarActor, number, (actor: CalendarActor) => Promise<boolean>][]) {
      const { store } = memoryStore()
      const state = (await begin(store)).searchParams.get('state') ?? ''
      const fetcher = vi.fn<typeof fetch>()
      await expect(
        completeCalendarAuthorization(
          callbackActor,
          state,
          'code',
          config,
          store,
          authorize,
          fetcher,
          now,
        ),
      ).rejects.toThrow('state')
      expect(fetcher).not.toHaveBeenCalled()
    }
  })

  it('does not save an incomplete grant or report success if persistence fails', async () => {
    for (const payload of [
      { scope: calendarScope },
      { refresh_token: 'refresh-test', scope: 'other' },
    ]) {
      const { store, saved } = memoryStore()
      const state = (await begin(store)).searchParams.get('state') ?? ''
      await expect(
        completeCalendarAuthorization(
          actor,
          state,
          'code',
          config,
          store,
          allowed,
          async () => json(payload),
          2000,
        ),
      ).rejects.toThrow('missing permission')
      expect(saved()).toBe('')
    }
    const { store } = memoryStore()
    const state = (await begin(store)).searchParams.get('state') ?? ''
    store.saveAuthorizedConnection = async () => {
      throw new Error('membership changed')
    }
    await expect(
      completeCalendarAuthorization(
        actor,
        state,
        'code',
        config,
        store,
        allowed,
        async () => json({ scope: calendarScope, refresh_token: 'refresh-test' }),
        2000,
      ),
    ).rejects.toThrow('membership changed')
  })

  it('binds encrypted credentials to the company and user and rejects tampering', () => {
    const encrypted = encryptRefreshToken('refresh-test', config.encryptionKey, actor)
    expect(encryptRefreshToken('refresh-test', config.encryptionKey, actor)).not.toBe(encrypted)
    expect(() =>
      decryptRefreshToken(encrypted, config.encryptionKey, {
        ...actor,
        tenantId: '5c000000-0000-4000-8000-000000000004',
      }),
    ).toThrow()
    expect(() =>
      decryptRefreshToken(encrypted, config.encryptionKey, {
        ...actor,
        userId: '5c000000-0000-4000-8000-000000000004',
      }),
    ).toThrow()
    const parts = encrypted.split('.')
    parts[3] = Buffer.alloc(16).toString('base64url')
    expect(() => decryptRefreshToken(parts.join('.'), config.encryptionKey, actor)).toThrow()
  })

  it('does not confirm revocation when Google is unavailable', async () => {
    const encrypted = encryptRefreshToken('refresh-test', config.encryptionKey, actor)
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      if (!(init?.body instanceof URLSearchParams)) throw new Error('Invalid request')
      expect(init.body.get('token')).toBe('refresh-test')
      return new Response(null, { status: 503 })
    })
    await expect(revokeCalendarAccess(actor, encrypted, config, fetcher)).rejects.toMatchObject({
      reason: 'unavailable',
    })
    await expect(
      revokeCalendarAccess(
        actor,
        encrypted,
        config,
        async () => new Response(null, { status: 200 }),
      ),
    ).resolves.toBeUndefined()
  })

  it('detects revocation and persists rotated refresh tokens before returning access', async () => {
    const { store, saved } = memoryStore()
    const original = encryptRefreshToken('old-refresh', config.encryptionKey, actor)
    await store.saveAuthorizedConnection(actor, original)
    await expect(
      refreshCalendarAccess(actor, original, config, store, async () =>
        json({ error: 'invalid_grant' }, 400),
      ),
    ).rejects.toMatchObject({ reason: 'revoked' })
    const result = await refreshCalendarAccess(
      actor,
      original,
      config,
      store,
      async () =>
        json({
          access_token: 'access-test',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'new-refresh',
          scope: calendarScope,
        }),
      1000,
    )
    expect(result.expiresAt).toBe(3601000)
    expect(decryptRefreshToken(saved(), config.encryptionKey, actor)).toBe('new-refresh')
    await expect(
      refreshCalendarAccess(
        actor,
        original,
        config,
        store,
        async () =>
          json({
            access_token: 'access-test',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'newer-refresh',
          }),
        1000,
      ),
    ).rejects.toThrow('Credential changed')
  })
})
