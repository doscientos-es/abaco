import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import { isRole, type Role } from '../domain/permissions'
import { needsWelcome } from '../domain/welcome'
import { activeCompanyField, getPreferredCompanyId } from './active-company'

export type Company = { id: string; name: string; role: Role }

type MembershipRow = {
  tenant_id: string
  role: string
  company_name: string
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
  /** New signup owners see the trial/payment choice once. Existing and invited accounts do not. */
  needsWelcome: boolean
}

/** One row per company the user belongs to; the role can differ in each one. */
async function fetchCompanies(): Promise<Company[]> {
  const { data: memberships, error } =
    await createBrowserSupabaseClient().rpc('my_company_memberships')
  // A failed query must not look like "no companies", or the user lands on the no-company page.
  if (error) throw new Error(`memberships: ${error.message}`)
  const companies: Company[] = []
  for (const row of (memberships ?? []) as unknown as MembershipRow[]) {
    if (!isRole(row.role)) continue
    companies.push({ id: row.tenant_id, name: row.company_name || 'Empresa', role: row.role })
  }
  return companies
}

/** Shared by concurrent session loads so the company is only created once. */
let pendingCompany: Promise<boolean> | null = null

/** Creates the company named at signup, then clears the name so it is never created twice. */
function createPendingCompany(name: unknown): Promise<boolean> {
  if (typeof name !== 'string' || !name.trim()) return Promise.resolve(false)
  pendingCompany ??= (async () => {
    const supabase = createBrowserSupabaseClient()
    const { data, error } = await supabase.rpc('create_company', { p_name: name })
    if (error || typeof data !== 'string') return false
    await supabase.auth.updateUser({ data: { company_name: null, [activeCompanyField]: data } })
    return true
  })().finally(() => {
    pendingCompany = null
  })
  return pendingCompany
}

/** Current session plus the user's role. Returns null when nobody is signed in. */
export async function loadSession(): Promise<AuthSession | null> {
  const supabase = createBrowserSupabaseClient()
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) return null

  let companies = await fetchCompanies()
  // A person who just signed up and confirmed their email gets the company they named at signup.
  if (companies.length === 0 && (await createPendingCompany(user.user_metadata?.company_name))) {
    companies = await fetchCompanies()
  }
  // The last company used wins; otherwise the oldest membership.
  const preferred = getPreferredCompanyId(user)
  const active = companies.find((company) => company.id === preferred) ?? companies[0]
  const fullName =
    typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : ''

  return {
    userId: user.id,
    email: user.email ?? '',
    fullName,
    tenantId: active?.id ?? null,
    role: active?.role ?? null,
    companies,
    needsWelcome: needsWelcome(active?.role ?? null, user.user_metadata ?? {}),
  }
}
