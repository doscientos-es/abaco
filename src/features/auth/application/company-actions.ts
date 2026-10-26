import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import { setPreferredCompanyId } from '../infrastructure/active-company'
import type { ActionResult } from './auth-actions'

/** Remembers the company to work in. The caller refreshes the session so the app follows. */
export async function chooseCompany(id: string): Promise<void> {
  await setPreferredCompanyId(id)
}

/** Creates a company owned by the signed-in user (database function `create_company`) and selects it. */
export async function createCompany(name: string): Promise<ActionResult> {
  const clean = name.trim()
  if (!clean) return { ok: false, message: 'Escribe el nombre de la empresa.' }
  if (clean.length > 120)
    return { ok: false, message: 'El nombre no puede superar 120 caracteres.' }
  const { data, error } = await createBrowserSupabaseClient().rpc('create_company', {
    p_name: clean,
  })
  if (error || typeof data !== 'string') {
    const full = error?.message.includes('máximo')
    return {
      ok: false,
      message: full
        ? 'Has alcanzado el máximo de empresas.'
        : 'No se pudo crear la empresa. Inténtalo de nuevo.',
    }
  }
  await setPreferredCompanyId(data)
  return { ok: true }
}
