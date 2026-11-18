import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export const billingProfileFields = [
  { name: 'legal_name', label: 'Razón social o nombre fiscal', length: 160 },
  { name: 'tax_id', label: 'NIF', length: 9, pattern: '[A-Za-z0-9]{9}' },
  { name: 'street', label: 'Dirección fiscal', length: 250 },
  { name: 'postal_code', label: 'Código postal', length: 5, pattern: '[0-9]{5}' },
  { name: 'city', label: 'Municipio', length: 120 },
  { name: 'province', label: 'Provincia', length: 120 },
  { name: 'email', label: 'Correo para recibir facturas', length: 254 },
] as const

type BillingProfile = Record<(typeof billingProfileFields)[number]['name'], string>

const saveError = 'No se guardaron los datos fiscales. Revisa los campos e inténtalo de nuevo.'

export const billingProfileQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['subscription-billing-profile', tenantId],
    queryFn: async () => {
      const { data, error } = await createBrowserSupabaseClient()
        .from('subscription_billing_profiles')
        .select('legal_name, tax_id, street, postal_code, city, province, email')
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (error) throw new Error('No se pudieron cargar los datos fiscales.')
      return data as BillingProfile | null
    },
  })

export async function saveBillingProfile(tenantId: string, form: FormData) {
  const profile = Object.fromEntries(
    billingProfileFields.map(({ name }) => {
      const entry = form.get(name)
      if (entry !== null && typeof entry !== 'string') throw new Error(saveError)
      const value = entry?.trim() ?? ''
      return [name, name === 'tax_id' ? value.toUpperCase() : value]
    }),
  )
  const { error } = await createBrowserSupabaseClient()
    .from('subscription_billing_profiles')
    .upsert({ ...profile, tenant_id: tenantId }, { onConflict: 'tenant_id' })
  if (error) throw new Error(saveError)
}
