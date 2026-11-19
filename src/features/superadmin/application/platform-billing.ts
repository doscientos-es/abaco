import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { CatalogUpdate } from '../domain/catalog-update'
import { platformPageSize, type InvoiceFilter } from '../domain/platform-navigation'

type PlatformInvoice = {
  id: string
  tenant_id: string
  company_name: string
  invoice_number: string | null
  invoice_status: string | null
  invoice_portal_url: string | null
  merchant_order: string
  amount_cents: number
  paid_at: string
}

export const platformInvoicesQuery = (
  userId: string,
  q: string,
  page: number,
  filter?: InvoiceFilter,
) =>
  queryOptions({
    queryKey: ['platform-invoices', userId, q, page, filter ?? null],
    queryFn: async ({ signal }) => {
      const { data, error } = await createBrowserSupabaseClient()
        .rpc('superadmin_subscription_invoices', {
          p_search: q,
          p_offset: (page - 1) * platformPageSize,
          p_filter: filter ?? null,
        })
        .abortSignal(signal)
      if (error) throw new Error('No se pudieron cargar las facturas.')
      const invoices = data as PlatformInvoice[]
      return {
        rows: invoices.slice(0, platformPageSize),
        hasMore: invoices.length > platformPageSize,
      }
    },
  })

export async function saveCatalogPlan(update: CatalogUpdate) {
  const { error } = await createBrowserSupabaseClient().rpc('superadmin_update_billing_plan', {
    p_plan: update.plan,
    p_revision: update.revision,
    p_name: update.name,
    p_audience: update.audience,
    p_benefit: update.benefit,
    p_rates: update.rates,
  })
  if (error?.code === '40001') {
    throw new Error('Otra persona ha actualizado el plan. Recarga el catálogo antes de guardar.')
  }
  if (error) throw new Error('No se pudo guardar el plan. Revisa los campos e inténtalo de nuevo.')
}
