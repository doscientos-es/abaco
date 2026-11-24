import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

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

const creditsSchema = z.object({
  monthly_limit: z.number().int().nonnegative(),
  monthly_used: z.number().int().nonnegative(),
  extra_remaining: z.number().int().nonnegative(),
})

export function useAiCredits(tenantId: string, userId: string | undefined) {
  return useQuery({
    queryKey: ['ai-credits', tenantId, userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await createBrowserSupabaseClient().rpc('ai_my_credits', {
        p_tenant: tenantId,
      })
      if (error) throw new Error('No se pudieron consultar tus créditos de IA.')
      if (data === null) return null
      return creditsSchema.parse(data)
    },
  })
}
