import { queryOptions } from '@tanstack/react-query'

import { isRole, type Role } from '@/features/auth'
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
        if (!profile || !isRole(row.role)) return []
        return [{ userId: row.user_id, email: profile.email, fullName: profile.full_name, role: row.role }]
      })
    },
  })

export type TeamResult = { ok: true; status?: 'invited' | 'added' } | { ok: false; message: string }

export async function inviteMember(input: {
  tenantId: string
  email: string
  role: Role
  fullName: string
}): Promise<TeamResult> {
  const { data, error } = await createBrowserSupabaseClient().functions.invoke<{ status?: 'invited' | 'added' }>(
    'invite-member',
    { body: input },
  )
  if (error) return { ok: false, message: 'No se pudo invitar. Comprueba el correo y tus permisos.' }
  return data?.status ? { ok: true, status: data.status } : { ok: true }
}

export async function changeMemberRole(tenantId: string, userId: string, role: Role): Promise<TeamResult> {
  const { error } = await createBrowserSupabaseClient()
    .from('memberships')
    .update({ role })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
  return error ? { ok: false, message: 'No se pudo cambiar el rol.' } : { ok: true }
}

export async function removeMember(tenantId: string, userId: string): Promise<TeamResult> {
  const { error } = await createBrowserSupabaseClient()
    .from('memberships')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
  return error ? { ok: false, message: 'No se pudo quitar a la persona.' } : { ok: true }
}
