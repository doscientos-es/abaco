import { queryOptions, useQuery } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import { can, type Permission } from '../domain/permissions'
import { loadSession } from '../infrastructure/load-session'

export const sessionQuery = queryOptions({
  queryKey: ['auth', 'session'],
  queryFn: loadSession,
  staleTime: 60_000,
})

export function useSession() {
  return useQuery(sessionQuery).data ?? null
}

/** UI-only check. RLS in Postgres is what actually enforces it. */
export function useCan(permission: Permission): boolean {
  return can(useSession()?.role, permission)
}

export type ActionResult = { ok: true } | { ok: false; message: string }

const ok: ActionResult = { ok: true }

function translateAuthError(message: string): string {
  const text = message.toLowerCase()
  if (text.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (text.includes('email not confirmed')) return 'Aún no has confirmado tu correo. Revisa tu bandeja de entrada.'
  if (text.includes('rate limit') || text.includes('too many')) return 'Demasiados intentos. Espera unos minutos y vuelve a probar.'
  if (text.includes('same password') || text.includes('different from the old')) return 'Elige una contraseña distinta de la anterior.'
  if (text.includes('weak') || text.includes('password should')) return 'La contraseña es demasiado débil.'
  if (text.includes('expired') || text.includes('invalid') || text.includes('otp')) return 'El enlace ha caducado o ya se usó. Pide uno nuevo.'
  return 'Algo ha fallado. Inténtalo de nuevo.'
}

export async function signIn(email: string, password: string): Promise<ActionResult> {
  const { error } = await createBrowserSupabaseClient().auth.signInWithPassword({ email, password })
  return error ? { ok: false, message: translateAuthError(error.message) } : ok
}

/** Always reports success so the form never reveals whether an email has an account. */
export async function requestPasswordReset(email: string): Promise<ActionResult> {
  const { error } = await createBrowserSupabaseClient().auth.resetPasswordForEmail(email)
  if (error && /rate limit|too many/i.test(error.message)) return { ok: false, message: translateAuthError(error.message) }
  return ok
}

export type ConfirmType = 'recovery' | 'invite' | 'signup' | 'magiclink' | 'email_change' | 'email'

const confirmTypes: readonly string[] = ['recovery', 'invite', 'signup', 'magiclink', 'email_change', 'email']

export function isConfirmType(value: string): value is ConfirmType {
  return confirmTypes.includes(value)
}

/** Exchanges the token_hash from the email link for a session. */
export async function confirmEmailLink(tokenHash: string, type: ConfirmType): Promise<ActionResult> {
  const { error } = await createBrowserSupabaseClient().auth.verifyOtp({ token_hash: tokenHash, type })
  return error ? { ok: false, message: translateAuthError(error.message) } : ok
}

export async function updatePassword(password: string): Promise<ActionResult> {
  const { error } = await createBrowserSupabaseClient().auth.updateUser({ password })
  return error ? { ok: false, message: translateAuthError(error.message) } : ok
}

export async function signOut(): Promise<void> {
  await createBrowserSupabaseClient().auth.signOut()
}
