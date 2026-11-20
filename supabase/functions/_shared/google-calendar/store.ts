import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

import type { CalendarActor, OAuthStore } from './oauth.ts'

export function createCalendarOAuthStore(admin: SupabaseClient, returnOrigin: string): OAuthStore {
  return {
    async saveState(hash, pending) {
      const { error } = await admin.rpc('save_google_calendar_oauth_state', {
        p_state_hash: hash,
        p_tenant_id: pending.actor.tenantId,
        p_user_id: pending.actor.userId,
        p_code_verifier: pending.verifier,
        p_return_origin: returnOrigin,
        p_expires_at: new Date(pending.expiresAt).toISOString(),
      })
      if (error) throw new Error('Unable to store OAuth state')
    },
    async consumeState(hash) {
      const { data, error } = await admin.rpc('consume_google_calendar_oauth_state', {
        p_state_hash: hash,
      })
      if (error) throw new Error('Unable to consume OAuth state')
      const row = Array.isArray(data) ? data[0] : null
      if (!row) return null
      return {
        actor: { tenantId: row.tenant_id, userId: row.user_id },
        verifier: row.code_verifier,
        expiresAt: new Date(row.expires_at).getTime(),
      }
    },
    async saveAuthorizedConnection(actor, encryptedRefreshToken) {
      const { error } = await admin.rpc('save_google_calendar_connection_token', {
        p_tenant_id: actor.tenantId,
        p_user_id: actor.userId,
        p_refresh_token_ciphertext: encryptedRefreshToken,
      })
      if (error) throw new Error('Unable to store Calendar connection')
    },
    async rotateRefreshToken(actor, previous, next) {
      const { data, error } = await admin.rpc('rotate_google_calendar_refresh_token', {
        p_tenant_id: actor.tenantId,
        p_user_id: actor.userId,
        p_previous: previous,
        p_next: next,
      })
      if (error || data !== true) throw new Error('Calendar credential changed')
    },
  }
}

export async function authorizeCalendarActor(admin: SupabaseClient, actor: CalendarActor) {
  const { data, error } = await admin.rpc('authorize_google_calendar_actor', {
    p_tenant_id: actor.tenantId,
    p_user_id: actor.userId,
  })
  return !error && data === true
}
