import { queryOptions } from '@tanstack/react-query'

import type { BillingTerms } from '@/features/billing'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

export type BillingAgreement = Pick<BillingTerms, 'plan' | 'period' | 'seats'> & {
  netCents: number | null
}

export async function scheduleBillingAgreement(tenantId: string, agreement: BillingAgreement) {
  const { error } = await createBrowserSupabaseClient().rpc('superadmin_schedule_billing', {
    p_tenant: tenantId,
    p_plan: agreement.plan,
    p_period: agreement.period,
    p_seats: agreement.seats,
    p_net: agreement.netCents,
  })
  if (error) {
    throw new Error(
      ['P0001', 'P0403'].includes(error.code)
        ? error.message
        : 'No se pudieron guardar las condiciones.',
    )
  }
}

export async function setCompanyBillingVat(tenantId: string, vatPercent: number) {
  const { error } = await createBrowserSupabaseClient().rpc('superadmin_set_billing_vat', {
    p_tenant: tenantId,
    p_vat: vatPercent,
  })
  if (error) throw new Error(error.code === 'P0001' ? error.message : 'No se pudo guardar el IVA.')
}

export type PlatformCompany = {
  id: string
  name: string
  plan: string
  subscription_status: string
  billing_interval: string | null
  current_period_end: string | null
  is_complimentary: boolean
  member_count: number
}

export type PlatformPayment = {
  id: string
  kind: 'first' | 'renewal'
  plan: string
  period: 'month' | 'year'
  amount_cents: number
  status: 'pending' | 'succeeded' | 'failed'
  created_at: string
  settled_at: string | null
}

export type PaymentSummary = {
  succeeded_count: number
  succeeded_cents: number
  failed_count: number
  pending_count: number
}

export const platformAccessQuery = (userId: string) =>
  queryOptions({
    queryKey: ['platform-access', userId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await createBrowserSupabaseClient().rpc('is_platform_superadmin')
      if (error) throw new Error('No se pudo comprobar el acceso de plataforma.')
      return data === true
    },
  })

export const platformCompaniesQuery = (search: string, offset: number) =>
  queryOptions({
    queryKey: ['platform-companies', search, offset],
    queryFn: async (): Promise<PlatformCompany[]> => {
      const { data, error } = await createBrowserSupabaseClient().rpc('superadmin_companies', {
        p_search: search,
        p_offset: offset,
      })
      if (error) throw new Error('No se pudieron cargar las empresas.')
      return data as PlatformCompany[]
    },
  })

export const platformPaymentsQuery = (tenantId: string, offset: number, status: string) =>
  queryOptions({
    queryKey: ['platform-payments', tenantId, offset, status],
    queryFn: async (): Promise<PlatformPayment[]> => {
      const { data, error } = await createBrowserSupabaseClient().rpc('superadmin_payments', {
        p_tenant: tenantId,
        p_offset: offset,
        p_status: status || null,
      })
      if (error) throw new Error('No se pudieron cargar los pagos.')
      return data as PlatformPayment[]
    },
  })

export const platformPaymentSummaryQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['platform-payment-summary', tenantId],
    queryFn: async (): Promise<PaymentSummary> => {
      const { data, error } = await createBrowserSupabaseClient().rpc(
        'superadmin_payment_summary',
        {
          p_tenant: tenantId,
        },
      )
      if (error || !data?.[0]) throw new Error('No se pudo cargar el resumen de pagos.')
      return data[0] as PaymentSummary
    },
  })
