import type { SupabaseClient } from '@supabase/supabase-js'

import type { StripeActor, StripeOAuthStore } from './oauth'

/** Server-only adapter: access is restricted to the service-role RPCs. */
export function createStripeOAuthStore(admin: SupabaseClient): StripeOAuthStore {
  return {
    async saveState(hash, actor, expiresAt) {
      const { error } = await admin.rpc('save_stripe_connect_oauth_state', {
        p_state_hash: hash,
        p_tenant_id: actor.tenantId,
        p_user_id: actor.userId,
        p_expires_at: new Date(expiresAt).toISOString(),
      })
      if (error) throw new Error('Could not save Stripe authorization state')
    },
    async consumeState(hash) {
      const { data, error } = await admin.rpc('consume_stripe_connect_oauth_state', {
        p_state_hash: hash,
      })
      if (error) throw new Error('Could not consume Stripe authorization state')
      if (data === null) return null
      if (
        typeof data !== 'object' ||
        Array.isArray(data) ||
        typeof data.tenantId !== 'string' ||
        typeof data.userId !== 'string' ||
        typeof data.expiresAt !== 'number' ||
        !Number.isSafeInteger(data.expiresAt)
      )
        throw new Error('Invalid Stripe authorization state')
      return { actor: { tenantId: data.tenantId, userId: data.userId }, expiresAt: data.expiresAt }
    },
    async saveConnection(actor, accountId, liveMode) {
      const { error } = await admin.rpc('save_stripe_connect_account', {
        p_tenant_id: actor.tenantId,
        p_user_id: actor.userId,
        p_account_id: accountId,
        p_livemode: liveMode,
      })
      if (error) throw new Error('Could not save Stripe connection')
    },
  }
}

/** A database RPC rechecks membership atomically before persisting each state or connection. */
export async function canManageStripe(admin: SupabaseClient, actor: StripeActor): Promise<boolean> {
  const { data, error } = await admin
    .from('memberships')
    .select('role')
    .eq('tenant_id', actor.tenantId)
    .eq('user_id', actor.userId)
    .maybeSingle()
  if (error) throw new Error('Could not verify Stripe permissions')
  return data?.role === 'owner' || data?.role === 'admin'
}

export async function stripeAccountExists(
  admin: SupabaseClient,
  actor: StripeActor,
  liveMode: boolean,
): Promise<boolean> {
  const { data, error } = await admin.rpc('stripe_connect_account_exists', {
    p_tenant_id: actor.tenantId,
    p_user_id: actor.userId,
    p_livemode: liveMode,
  })
  if (error || typeof data !== 'boolean') throw new Error('Stripe status unavailable')
  return data
}
