import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import { welcomePendingField } from '../domain/welcome'
import type { ActionResult } from './auth-actions'

/** Only the explicit signup marker triggers the welcome screen, never existing accounts. */
export function welcomeRedirect(pending: boolean, path: string): '/bienvenida' | '/' | null {
  if (path === '/nueva-contrasena') return null
  if (path === '/bienvenida') return pending ? null : '/'
  return pending ? '/bienvenida' : null
}

/** Both choices finish onboarding. Billing still requires an explicit, separate checkout. */
export async function completeWelcome(): Promise<ActionResult> {
  try {
    const { error } = await createBrowserSupabaseClient().auth.updateUser({
      data: { [welcomePendingField]: false },
    })
    if (!error) return { ok: true }
  } catch {
    // Keep the choice available if saving fails.
  }
  return { ok: false, message: 'No se pudo guardar tu elección. Inténtalo de nuevo.' }
}