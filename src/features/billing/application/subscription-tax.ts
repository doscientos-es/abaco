import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export const subscriptionTerritories = {
  mainland: 'Península',
  balearic: 'Baleares',
  canary: 'Canarias',
  ceuta: 'Ceuta',
  melilla: 'Melilla',
  review: 'Por revisar',
} as const
export type SubscriptionTerritory = keyof typeof subscriptionTerritories

export type SubscriptionTax = {
  detected: SubscriptionTerritory
  override: SubscriptionTerritory | null
  territory: SubscriptionTerritory
  status: 'ready' | 'review' | 'outside_iva'
}

export const subscriptionTaxQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['subscription-billing-tax', tenantId],
    queryFn: async (): Promise<SubscriptionTax> => {
      const { data, error } = await createBrowserSupabaseClient().rpc('subscription_billing_tax', {
        p_tenant: tenantId,
      })
      if (error || !data) throw new Error('No se pudo comprobar el territorio fiscal.')
      return data as SubscriptionTax
    },
  })

export async function setSubscriptionTaxTerritory(
  tenantId: string,
  territory: SubscriptionTerritory | null,
) {
  const { error } = await createBrowserSupabaseClient().rpc(
    'superadmin_set_subscription_tax_territory',
    { p_tenant: tenantId, p_territory: territory },
  )
  if (error)
    throw new Error(
      error.code === 'P0001' ? error.message : 'No se pudo guardar el territorio fiscal.',
    )
}
