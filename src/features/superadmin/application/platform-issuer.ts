import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { IssuerProfile, IssuerSettings } from '../domain/platform-issuer'

export const platformIssuerQuery = (userId: string) =>
  queryOptions({
    queryKey: ['platform-invoice-issuer', userId],
    queryFn: async (): Promise<IssuerSettings> => {
      const { data, error } = await createBrowserSupabaseClient().rpc('superadmin_invoice_issuer')
      if (error || !data) throw new Error('No se pudieron cargar los datos fiscales.')
      return data as IssuerSettings
    },
  })

export async function savePlatformIssuer(revision: number, profile: IssuerProfile) {
  const { error } = await createBrowserSupabaseClient().rpc('superadmin_save_invoice_issuer', {
    p_revision: revision,
    p_profile: profile,
  })
  if (error)
    throw new Error(
      ['22023', '40001'].includes(error.code)
        ? error.message
        : 'No se pudieron guardar los datos fiscales.',
    )
}
