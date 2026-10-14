import type { User } from '@supabase/supabase-js'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

/** User metadata key holding the company the user last worked in. */
export const activeCompanyField = 'active_company_id'

/** Company the user last worked in, kept in their Supabase user metadata. Only a preference: it is checked against their memberships. */
export function getPreferredCompanyId(user: User): string | null {
  const value: unknown = user.user_metadata?.[activeCompanyField]
  return typeof value === 'string' ? value : null
}

export async function setPreferredCompanyId(id: string): Promise<void> {
  // A failure only means the first company is used next time.
  await createBrowserSupabaseClient().auth.updateUser({ data: { [activeCompanyField]: id } })
}
