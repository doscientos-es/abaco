import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { canManageStripe, createStripeOAuthStore } from './oauth-store'

const actor = {
  tenantId: 'bd000000-0000-4000-8000-000000000001',
  userId: 'bd000000-0000-4000-8000-000000000002',
}

describe('Stripe OAuth persistence adapter', () => {
  it('calls the server-only RPCs and preserves the actor from a consumed state', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({
        data: { ...actor, expiresAt: 1000 },
        error: null,
      })
      .mockResolvedValueOnce({ error: null })
    const store = createStripeOAuthStore({ rpc } as unknown as SupabaseClient)
    await store.saveState('hash', actor, 1000)
    expect(rpc).toHaveBeenNthCalledWith(1, 'save_stripe_connect_oauth_state', {
      p_state_hash: 'hash',
      p_tenant_id: actor.tenantId,
      p_user_id: actor.userId,
      p_expires_at: '1970-01-01T00:00:01.000Z',
    })
    await expect(store.consumeState('hash')).resolves.toEqual({ actor, expiresAt: 1000 })
    await store.saveConnection(actor, 'acct_Test', false)
    expect(rpc).toHaveBeenLastCalledWith('save_stripe_connect_account', {
      p_tenant_id: actor.tenantId,
      p_user_id: actor.userId,
      p_account_id: 'acct_Test',
      p_livemode: false,
    })
  })

  it('rejects malformed state and storage failures without exposing database details', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { ...actor, expiresAt: 'bad' }, error: null })
      .mockResolvedValueOnce({ error: { message: 'sensitive detail' } })
    const store = createStripeOAuthStore({ rpc } as unknown as SupabaseClient)
    await expect(store.consumeState('hash')).rejects.toThrow('Invalid Stripe authorization state')
    await expect(store.saveConnection(actor, 'acct_Test', false)).rejects.toThrow(
      'Could not save Stripe connection',
    )
  })

  it.each(['admin', 'owner', 'viewer'])('scopes role %s to the tenant and user', async (role) => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { role }, error: null })
    const eq = vi.fn().mockReturnThis()
    const select = vi.fn().mockReturnValue({ eq, maybeSingle })
    const admin = { from: vi.fn().mockReturnValue({ select }) } as unknown as SupabaseClient
    await expect(canManageStripe(admin, actor)).resolves.toBe(role !== 'viewer')
    expect(eq).toHaveBeenCalledWith('tenant_id', actor.tenantId)
    expect(eq).toHaveBeenCalledWith('user_id', actor.userId)
  })
})
