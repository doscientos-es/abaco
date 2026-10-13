import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | undefined

/** Without Supabase variables the app runs in demo mode (local data, no login). */
export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
}

/**
 * Creates the browser client only when a real Supabase adapter needs it.
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
    auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
  })
  return browserClient
}
