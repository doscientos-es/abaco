import { afterEach, describe, expect, it, vi } from 'vitest'

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ auth: { getSession } }),
}))

import { beginStripeConnection, getStripeConnection } from './stripe-connect-actions'

describe('Stripe connection actions', () => {
  afterEach(() => {
    vi.resetAllMocks()
    vi.unstubAllGlobals()
  })

  it('requests the current tenant connection without exposing credentials to Stripe', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null })
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ connected: true, liveMode: false }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetcher)
    await expect(getStripeConnection('tenant-a')).resolves.toEqual({
      connected: true,
      liveMode: false,
    })
    expect(fetcher).toHaveBeenCalledWith(
      '/api/stripe_connect_authorize',
      expect.objectContaining({ body: JSON.stringify({ tenantId: 'tenant-a', action: 'status' }) }),
    )
  })

  it('rejects authorization URLs outside Stripe and invalid status responses', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null })
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ url: 'https://evil.test' })))
    vi.stubGlobal('fetch', fetcher)
    await expect(beginStripeConnection('tenant-a')).rejects.toThrow()
    await expect(getStripeConnection('tenant-a')).rejects.toThrow()
  })

  it('refuses to call the server without a signed-in session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(beginStripeConnection('tenant-a')).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
