import { queryOptions } from '@tanstack/react-query'

import type { ModuleRate } from '@/features/product-modules'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { CatalogUpdate } from '../domain/catalog-update'
import { platformPageSize, type InvoiceFilter } from '../domain/platform-navigation'

export type PlatformInvoice = {
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

async function fetchInvoicePage(
  q: string,
  page: number,
  signal: AbortSignal,
  filter?: InvoiceFilter,
  tenantId?: string,
  reference?: string,
) {
  const { data, error } = await createBrowserSupabaseClient()
    .rpc('superadmin_subscription_invoice_directory', {
      p_search: q,
      p_offset: (page - 1) * platformPageSize,
      p_filter: filter ?? null,
      p_tenant: tenantId ?? null,
      p_reference: reference ?? null,
    })
    .abortSignal(signal)
  if (error) throw new Error('No se pudieron cargar las facturas.')
  return data as PlatformInvoice[]
}

export const platformInvoicesQuery = (
  userId: string,
  q: string,
  page: number,
  filter?: InvoiceFilter,
  tenantId?: string,
) =>
  queryOptions({
    queryKey: ['platform-invoices', userId, q, page, filter ?? null, tenantId ?? null],
    queryFn: async ({ signal }) => {
      const invoices = await fetchInvoicePage(q, page, signal, filter, tenantId)
      return {
        rows: invoices.slice(0, platformPageSize),
        hasMore: invoices.length > platformPageSize,
      }
    },
  })

export const platformInvoiceQuery = (userId: string, reference: string, tenantId?: string) =>
  queryOptions({
    queryKey: ['platform-invoice', userId, reference, tenantId ?? null],
    queryFn: async ({ signal }) => {
      const invoices = await fetchInvoicePage('', 1, signal, undefined, tenantId, reference)
      return invoices.find((row) => row.merchant_order === reference) ?? null
    },
  })

export async function saveCatalogPlan(update: CatalogUpdate) {
  const { error } = await createBrowserSupabaseClient().rpc('superadmin_update_billing_plan', {
    p_plan: update.plan,
    p_revision: update.revision,
    p_name: update.name,
    p_audience: update.audience,
    p_benefit: update.benefit,
    p_rates:
      update.seatMonthlyCents === undefined
        ? update.rates
        : { ...update.rates, seat_monthly_cents: update.seatMonthlyCents },
  })
  if (error?.code === '40001') {
    throw new Error('Otra persona ha actualizado el plan. Recarga el catálogo antes de guardar.')
  }
  if (error) throw new Error('No se pudo guardar el plan. Revisa los campos e inténtalo de nuevo.')
}

export async function saveModulePrice({
  rate,
  monthlyCents,
  yearlyCents,
}: {
  rate: ModuleRate
  monthlyCents: number
  yearlyCents: number
}) {
  const { error } = await createBrowserSupabaseClient().rpc('superadmin_update_module_price', {
    p_code: rate.code,
    p_expected_monthly: rate.monthly_cents,
    p_expected_yearly: rate.yearly_cents,
    p_monthly: monthlyCents,
    p_yearly: yearlyCents,
  })
  if (error?.code === '40001') {
    throw new Error('El módulo cambió. Recarga el catálogo antes de guardar.')
  }
  if (error) throw new Error('No se pudo publicar el precio del módulo.')
}
