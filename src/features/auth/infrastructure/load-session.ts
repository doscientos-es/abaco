import { createBrowserSupabaseClient, isSupabaseConfigured } from '@/shared/lib/supabase/client'

import { isRole, type Role } from '../domain/permissions'

export type AuthSession = {
  userId: string
  email: string
  fullName: string
  /** Company the user works for. Null when the account has not been added to any company yet. */
  tenantId: string | null
  role: Role | null
  /** True when running without Supabase: no login, everything is local. */
  demo: boolean
}

const demoSession: AuthSession = {
  userId: 'demo-user',
  email: 'demo@local',
  fullName: 'Modo demo',
  tenantId: null,
  role: 'owner',
  demo: true,
}

/** Current session plus the user's role. Returns null when nobody is signed in. */
export async function loadSession(): Promise<AuthSession | null> {
  if (!isSupabaseConfigured()) return demoSession

  const supabase = createBrowserSupabaseClient()
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) return null

  // RLS only returns the user's own memberships. The oldest one is the default company.
  const { data: memberships } = await supabase
    .from('memberships')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
  const membership = memberships?.[0]
  const fullName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : ''

  return {
    userId: user.id,
    email: user.email ?? '',
    fullName,
    tenantId: membership?.tenant_id ?? null,
    role: membership && isRole(membership.role) ? membership.role : null,
    demo: false,
  }
}
