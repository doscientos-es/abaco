import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

const statusSchema = z.object({
  stage: z.enum(['selection', 'pending', 'booking', 'complete', 'billing_issue']),
  failed: z.boolean(),
  booking_reference: z.string().uuid().nullable(),
  appointment_at: z.string().nullable(),
})

export const companyOnboardingQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['company-onboarding', tenantId],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await createBrowserSupabaseClient().rpc('company_onboarding_status', {
        p_tenant: tenantId,
      })
      if (error) throw new Error('No se pudo comprobar el alta de la empresa.')
      return statusSchema.nullable().parse(data)
    },
  })

export function onboardingDestination(
  stage: z.infer<typeof statusSchema>['stage'] | undefined,
  path: string,
) {
  if (path === '/nueva-contrasena') return null
  const pending = stage !== undefined && stage !== 'complete'
  if (path === '/bienvenida') return pending ? null : '/'
  return pending ? '/bienvenida' : null
}
