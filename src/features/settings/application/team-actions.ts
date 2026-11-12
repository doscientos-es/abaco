import { queryOptions } from '@tanstack/react-query'

import { roleFromMembership, type Role } from '@/features/auth'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type TeamMember = { userId: string; email: string; fullName: string; role: Role }

export const teamQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['team', tenantId],
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await createBrowserSupabaseClient()
        .from('memberships')
        .select('user_id, role, profiles(email, full_name)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
      if (error) throw new Error('No se pudo cargar el equipo.')
      return data.flatMap((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
        const role = roleFromMembership(row.role)
        if (!profile || !role) return []
        return [
          {
            userId: row.user_id,
            email: profile.email,
            fullName: profile.full_name,
            role,
          },
        ]
      })
    },
  })

export type TeamResult = { ok: true; status?: 'invited' | 'added' } | { ok: false; message: string }

async function inviteErrorMessage(context: unknown): Promise<string> {
  const fallback = 'No se pudo invitar. Inténtalo de nuevo.'
  if (!(context instanceof Response)) return fallback
  if (context.status === 401) return 'Tu sesión ha caducado. Inicia sesión de nuevo.'
  if (context.status === 403) return 'No tienes permiso para invitar a esta persona.'
  if (context.status === 400) return 'Revisa el correo y el rol de la persona.'
  if (context.status === 409) {
    const body: unknown = await context.json().catch(() => null)
    if (body && typeof body === 'object' && 'error' in body && body.error === 'plan_limit') {
      return 'Has alcanzado el límite de personas de tu plan.'
    }
  }
  return fallback
}

export async function inviteMember(input: {
  tenantId: string
  email: string
  role: Role
  fullName: string
}): Promise<TeamResult> {
  const { data, error } = await createBrowserSupabaseClient().functions.invoke<{
    status?: 'invited' | 'added'
  }>('invite-member', { body: input })
  if (error) return { ok: false, message: await inviteErrorMessage(error.context) }
  if (data?.status === 'invited' || data?.status === 'added')
    return { ok: true, status: data.status }
  return {
    ok: false,
    message: 'No se pudo confirmar la invitación. Revisa el equipo antes de reintentar.',
  }
}

export async function changeMemberRole(
  tenantId: string,
  userId: string,
  role: Role,
): Promise<TeamResult> {
  const { count, error } = await createBrowserSupabaseClient()
    .from('memberships')
    .update({ role }, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
  return error || count !== 1
    ? {
        ok: false,
        message: 'No se pudo cambiar el rol. Actualiza el equipo y revisa tus permisos.',
      }
    : { ok: true }
}

export async function removeMember(tenantId: string, userId: string): Promise<TeamResult> {
  const { count, error } = await createBrowserSupabaseClient()
    .from('memberships')
    .delete({ count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
  return error || count !== 1
    ? {
        ok: false,
        message: 'No se pudo quitar a la persona. Actualiza el equipo y revisa tus permisos.',
      }
    : { ok: true }
}
