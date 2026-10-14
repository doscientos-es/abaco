import type { Client, Estimate, Tenant } from '@/shared/domain/types'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import {
  clientFromRow,
  estimateFromRow,
  tenantFromRow,
  type EstimateRow,
} from '@/shared/store/supabase-mappers'

export type PublicEstimate = { estimate: Estimate; tenant: Tenant; client: Client | undefined }
export type PublicAction = 'view' | 'accept' | 'reject'
export type PublicResult =
  | { ok: true; data: PublicEstimate }
  | { ok: false; error: string; status?: string }

type ErrorContext = { json?: () => Promise<{ error?: string; status?: string }> }
type Payload = { estimate: EstimateRow; tenant: Record<string, unknown>; client: Record<string, unknown> | null }

/** Calls the public-estimate Edge Function: the link token is the only credential. */
export async function callPublicEstimate(
  token: string,
  action: PublicAction,
  name?: string,
): Promise<PublicResult> {
  const { data, error } = await createBrowserSupabaseClient().functions.invoke<Payload>('public-estimate', {
    body: { token, action, ...(name ? { name } : {}) },
  })
  if (error || !data) {
    const body = await (error as { context?: ErrorContext } | null)?.context?.json?.().catch(() => undefined)
    return { ok: false, error: body?.error ?? 'unknown', ...(body?.status ? { status: body.status } : {}) }
  }
  return {
    ok: true,
    data: {
      estimate: estimateFromRow(data.estimate),
      tenant: tenantFromRow(data.tenant),
      client: data.client ? clientFromRow(data.client) : undefined,
    },
  }
}
