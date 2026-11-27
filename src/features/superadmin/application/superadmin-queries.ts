import { queryOptions } from '@tanstack/react-query'

import type { BillingTerms } from '@/features/billing'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { CompanyProfile, CompanyProfileValues } from '../domain/company-profile'
import { platformPageSize, type CompanyFilter } from '../domain/platform-navigation'

export type CompanyReferral = { referrer_id: string | null; referrer_name: string | null }

export const platformCompanyReferralQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['platform-company-referral', tenantId],
    queryFn: async (): Promise<CompanyReferral | null> => {
      const { data, error } = await createBrowserSupabaseClient().rpc(
        'superadmin_company_referral',
        {
          p_tenant: tenantId,
        },
      )
      if (error) throw new Error('No se pudo cargar la recomendación.')
      return data as CompanyReferral | null
    },
  })

export async function setCompanyReferral(
  tenantId: string,
  referrer: string | null,
  expected: string | null,
) {
  const { error } = await createBrowserSupabaseClient().rpc('superadmin_set_company_referral', {
    p_tenant: tenantId,
    p_referrer: referrer,
    p_expected: expected,
  })
  if (error)
    throw new Error(
      ['22023', '40001'].includes(error.code)
        ? error.message
        : 'No se pudo guardar la recomendación.',
    )
}

export const platformCompanyProfileQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['platform-company-profile', tenantId],
    queryFn: async (): Promise<CompanyProfile | null> => {
      const { data, error } = await createBrowserSupabaseClient().rpc(
        'superadmin_company_profile',
        {
          p_tenant: tenantId,
        },
      )
      if (error) throw new Error('No se pudieron cargar los datos de la empresa.')
      return data as CompanyProfile | null
    },
  })

export async function updateCompanyProfile(
  tenantId: string,
  expectedUpdatedAt: string,
  profile: CompanyProfileValues,
) {
  const { error } = await createBrowserSupabaseClient().rpc('superadmin_update_company_profile', {
    p_tenant: tenantId,
    p_expected_updated_at: expectedUpdatedAt,
    p_profile: profile,
  })
  if (error)
    throw new Error(
      ['22023', '40001', 'P0001'].includes(error.code)
        ? error.message
        : 'No se pudieron guardar los datos de la empresa.',
    )
}

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

export async function restoreBillingCatalog(tenantId: string, expectedNetCents: number) {
  const { error } = await createBrowserSupabaseClient().rpc('superadmin_restore_billing_catalog', {
    p_tenant: tenantId,
    p_expected_net: expectedNetCents,
  })
  if (error) {
    throw new Error(
      ['P0001', 'P0403'].includes(error.code)
        ? error.message
        : 'No se pudo restaurar la tarifa de catálogo.',
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
  billing_bucket?: CompanyFilter
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
  invoice_number?: string | null
  invoice_status?: string | null
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
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await createBrowserSupabaseClient().rpc('is_platform_superadmin')
      if (error) throw new Error('No se pudo comprobar el acceso de plataforma.')
      return data === true
    },
  })

export type PlatformOverview = {
  companies: Partial<Record<CompanyFilter, number>>
  collections: { month: string; cents: number; count: number }[]
}

export const platformOverviewQuery = (userId: string) =>
  queryOptions({
    queryKey: ['platform-overview', userId],
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<PlatformOverview> => {
      const { data, error } = await createBrowserSupabaseClient()
        .rpc('superadmin_overview')
        .abortSignal(signal)
      if (error || !data) throw new Error('No se pudo cargar el resumen de plataforma.')
      return data as PlatformOverview
    },
  })

export const platformCompaniesQuery = (
  userId: string,
  search: string,
  offset: number,
  status?: CompanyFilter,
) =>
  queryOptions({
    queryKey: ['platform-companies', userId, search, offset, status ?? null],
    queryFn: async ({ signal }) => {
      const { data, error } = await createBrowserSupabaseClient()
        .rpc('superadmin_company_directory', {
          p_search: search,
          p_offset: offset,
          p_status: status ?? null,
        })
        .abortSignal(signal)
      if (error) throw new Error('No se pudieron cargar las empresas.')
      const rows = data as PlatformCompany[]
      return { rows: rows.slice(0, platformPageSize), hasMore: rows.length > platformPageSize }
    },
  })

export const platformCompanyQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['platform-company', tenantId],
    queryFn: async (): Promise<PlatformCompany | null> => {
      const { data, error } = await createBrowserSupabaseClient()
        .rpc('superadmin_company', { p_tenant: tenantId })
        .maybeSingle<PlatformCompany>()
      if (error) throw new Error('No se pudo cargar la empresa.')
      return data
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
      const payments = data as PlatformPayment[]
      const confirmed = payments.filter((payment) => payment.status === 'succeeded')
      if (!confirmed.length) return payments
      const { data: states, error: statesError } = await createBrowserSupabaseClient().rpc(
        'superadmin_subscription_invoice_states',
        {
          p_tenant: tenantId,
          p_payments: confirmed.map((payment) => payment.id),
        },
      )
      if (statesError) throw new Error('No se pudo consultar el estado de las facturas.')
      const byPayment = new Map<string, Pick<PlatformPayment, 'invoice_status' | 'invoice_number'>>(
        states.map((row: PlatformPayment) => [row.id, row]),
      )
      return payments.map((payment) => ({ ...payment, ...byPayment.get(payment.id) }))
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
