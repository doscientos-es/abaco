import { createBrowserSupabaseClient, isSupabaseConfigured } from '@/shared/lib/supabase/client'

import { isRole, type Role } from '../domain/permissions'
import { getPreferredCompanyId } from './active-company'

export type Company = { id: string; name: string; role: Role }

type MembershipRow = {
  tenant_id: string
  role: string
  tenants: { name: string } | { name: string }[] | null
}

export type AuthSession = {
  userId: string
  email: string
  fullName: string
  /** Company being worked on now. Null when the account has not been added to any company yet. */
  tenantId: string | null
  /** The user's role in that company. */
  role: Role | null
  /** Every company the user belongs to, to switch between them. */
  companies: Company[]
  /** True when running without Supabase: no login, everything is local. */
  demo: boolean
}

const demoSession: AuthSession = {
  userId: 'demo-user',
  email: 'demo@local',
  fullName: 'Modo demo',
  tenantId: null,
  role: 'owner',
  companies: [],
  demo: true,
}

/** Current session plus the user's role. Returns null when nobody is signed in. */
export async function loadSession(): Promise<AuthSession | null> {
  if (!isSupabaseConfigured()) return demoSession

  const supabase = createBrowserSupabaseClient()
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) return null

  // One row per company the user belongs to; the role can differ in each one.
  const { data: memberships } = await supabase
    .from('memberships')
    .select('tenant_id, role, tenants(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
  const companies: Company[] = []
  for (const row of (memberships ?? []) as unknown as MembershipRow[]) {
    if (!isRole(row.role)) continue
    const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants
    companies.push({ id: row.tenant_id, name: tenant?.name ?? 'Empresa', role: row.role })
  }
  // The last company used wins; otherwise the oldest membership.
  const preferred = getPreferredCompanyId()
  const active = companies.find((company) => company.id === preferred) ?? companies[0]
  const fullName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : ''

  return {
    userId: user.id,
    email: user.email ?? '',
    fullName,
    tenantId: active?.id ?? null,
    role: active?.role ?? null,
    companies,
    demo: false,
  }
}
