import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | undefined

/**
 * Creates the browser client (one per page). Supabase is required: there is no offline or demo mode.
 * VITE_* values are public by design; data access is protected by RLS.
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  if (browserClient) return browserClient

  const { VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey, VITE_SUPABASE_URL: url } = import.meta.env
  if (!url || !publishableKey) {
    throw new Error(
      'Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY para usar Supabase.',
    )
  }

  // Email links carry a token_hash that /confirmar verifies by hand, so the SDK must not parse the URL.
  browserClient = createClient(url, publishableKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  return browserClient
}
