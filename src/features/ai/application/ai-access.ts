import { useQuery } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

/** The database, not this UI check, is the authority for every generation. */
export function useAiAccess(tenantId: string, userId: string | undefined) {
  return useQuery({
    queryKey: ['ai-access', tenantId, userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await createBrowserSupabaseClient().rpc('ai_my_access', {
        p_tenant: tenantId,
      })
      if (error) throw new Error('No se pudo comprobar el acceso a IA.')
      return data === true
    },
  })
}
