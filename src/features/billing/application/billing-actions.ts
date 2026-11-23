import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import {
  paidPlans,
  type BillingTerms,
  type CatalogRate,
  type Interval,
  type PaidPlan,
  type Plan,
} from '../domain/plans'

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export type Subscription = {
  plan: Plan
  status: SubscriptionStatus
  isComplimentary: boolean
  trialEndsAt: Date
  interval: Interval | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  /** Plan change already requested: applied on the next renewal. */
  nextPlan: PaidPlan | null
  nextInterval: Interval | null
  /** Whether the company can create and edit data. Mirrors `tenant_can_write` in the database. */
  canWrite: boolean
  /** Whole days of trial left (0 when over or not on trial). */
  trialDaysLeft: number
}

const statuses: readonly string[] = ['trialing', 'active', 'past_due', 'canceled']
const plans: readonly string[] = ['trial', ...paidPlans]
const subscriptionFields =
  'plan, subscription_status, trial_ends_at, billing_interval, current_period_end, cancel_at_period_end, next_plan, next_interval'

export function describeSubscription(row: {
  plan: string
  subscription_status: string
  is_complimentary: boolean
  trial_ends_at: string
  billing_interval: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  next_plan: string | null
  next_interval: string | null
}): Subscription {
  const status = (
    statuses.includes(row.subscription_status) ? row.subscription_status : 'canceled'
  ) as SubscriptionStatus
  const trialEndsAt = new Date(row.trial_ends_at)
  const trialActive = status === 'trialing' && trialEndsAt.getTime() > Date.now()
  return {
    plan: (plans.includes(row.plan) ? row.plan : 'trial') as Plan,
    status,
    isComplimentary: row.is_complimentary,
    trialEndsAt,
    interval:
      row.billing_interval === 'year' || row.billing_interval === 'month'
        ? row.billing_interval
        : null,
    currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end) : null,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    nextPlan: paidPlans.find((plan) => plan === row.next_plan) ?? null,
    nextInterval:
      row.next_interval === 'year' || row.next_interval === 'month' ? row.next_interval : null,
    canWrite: row.is_complimentary || trialActive || status === 'active' || status === 'past_due',
    trialDaysLeft:
      trialActive && !row.is_complimentary
        ? Math.max(1, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000))
        : 0,
  }
}

export const subscriptionQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['subscription', tenantId],
    staleTime: 60_000,
    queryFn: async (): Promise<Subscription> => {
      const client = createBrowserSupabaseClient()
      const { data, error } = await client
        .from('tenants')
        .select(`${subscriptionFields}, is_complimentary`)
        .eq('id', tenantId)
        .single()
      // Keep the app usable while this schema change is awaiting deployment.
      if (error?.code === '42703' && error.message.includes('is_complimentary')) {
        const legacy = await client
          .from('tenants')
          .select(subscriptionFields)
          .eq('id', tenantId)
          .single()
        if (legacy.error) throw new Error('No se pudo cargar el plan.')
        return describeSubscription({ ...legacy.data, is_complimentary: false })
      }
      if (error) throw new Error('No se pudo cargar el plan.')
      return describeSubscription(data)
    },
  })

/** People in the company today: the only thing that decides which plan is needed. */
export const memberCountQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['member-count', tenantId],
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await createBrowserSupabaseClient()
        .from('memberships')
        .select('user_id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
      if (error) throw new Error('No se pudo contar el equipo.')
      return count ?? 0
    },
  })

export const billingCatalogQuery = queryOptions({
  queryKey: ['billing-catalog'],
  staleTime: 60_000,
  queryFn: async (): Promise<CatalogRate[]> => {
    const { data, error } = await createBrowserSupabaseClient()
      .from('billing_catalog')
      .select(
        'plan,seats,monthly_cents,yearly_cents,seat_monthly_cents,vat_percent,plan_info:billing_plan_display(name,audience,benefit,revision)',
      )
      .order('seats')
      .overrideTypes<CatalogRate[], { merge: false }>()
    if (error || !data.length) throw new Error('No se pudieron cargar los precios.')
    return data
  },
})

export type BillingPreview = {
  current: BillingTerms | null
  next: BillingTerms | null
  pending: boolean
  cancel_at_period_end: boolean
  vat_percent: number
  fixed_net_cents?: number | null
  next_managed?: boolean
  module_monthly_cents?: number
  module_yearly_cents?: number
}

export const billingPreviewQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['billing-preview', tenantId],
    queryFn: async (): Promise<BillingPreview> => {
      const { data, error } = await createBrowserSupabaseClient().rpc('billing_preview', {
        p_tenant: tenantId,
      })
      if (error || !data) throw new Error('No se pudo cargar el próximo cobro.')
      return data as BillingPreview
    },
  })

export type ReferralOverview = {
  code: string
  referred_count: number
  recommended_by: string | null
  rewards_active: false
}

export const referralOverviewQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['referral-overview', tenantId],
    staleTime: 60_000,
    queryFn: async (): Promise<ReferralOverview | null> => {
      const { data, error } = await createBrowserSupabaseClient().rpc('referral_program_status', {
        p_tenant: tenantId,
      })
      if (error?.code === 'PGRST202') return null
      if (error || !data) throw new Error('No se pudo cargar el estado de referidos.')
      return data as ReferralOverview
    },
  })

export type PaymentStatus = 'pending' | 'succeeded' | 'failed'

export type Payment = {
  id: string
  /** Redsys operation number: the reference to quote when asking about a charge. */
  order: string
  kind: 'first' | 'renewal'
  plan: PaidPlan
  period: Interval
  /** Amount charged, VAT included. */
  amountCents: number
  /** Portion of the invoice actually charged to the saved card. */
  chargedCents: number | null
  /** Referral balance used to settle this invoice. */
  referralCreditCents: number | null
  netCents: number | null
  vatPercent: number
  status: PaymentStatus
  createdAt: Date
  settledAt: Date | null
  invoiceNumber: string | null
  invoicePortalUrl: string | null
}

type BillingPaymentRow = {
  id: string
  merchant_order: string
  kind: string
  plan: string
  period: string
  amount_cents: number
  charge_cents?: number | null
  referral_credit_cents?: number | null
  net_cents: number | null
  vat_percent: number
  status: string
  created_at: string
  settled_at: string | null
  invoice_number: string | null
  invoice_portal_url: string | null
}

/** Every charge attempt of the company, newest first. Only admins can read them (RLS). */
export const paymentsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['billing-payments', tenantId],
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }): Promise<Payment[]> => {
      const controller = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const loadPayments = async () => {
          const client = createBrowserSupabaseClient()
          const requestSignal = AbortSignal.any([signal, controller.signal])
          const select = (columns: string) =>
            client
              .from('billing_payments')
              .select(columns)
              .eq('tenant_id', tenantId)
              .order('created_at', { ascending: false })
              .returns<BillingPaymentRow[]>()
              .abortSignal(requestSignal)
          const common =
            'id, merchant_order, kind, plan, period, amount_cents, net_cents, vat_percent, status, created_at, settled_at, invoice_number, invoice_portal_url'
          const result = await select(`${common}, charge_cents, referral_credit_cents`)
          if (
            result.error &&
            ['42703', 'PGRST204'].includes(result.error.code) &&
            /charge_cents|referral_credit_cents/.test(result.error.message)
          ) {
            const legacy = await select(common)
            if (legacy.error) throw legacy.error
            return legacy.data.map((row) => ({
              ...row,
              charge_cents: null,
              referral_credit_cents: null,
            }))
          }
          if (result.error) throw result.error
          return result.data
        }
        // Also bound a stalled auth/token lookup, before Supabase starts the HTTP request.
        const data = await Promise.race([
          loadPayments(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error('No se pudo cargar el historial de pagos.'))
              controller.abort()
            }, 15_000)
          }),
        ])
        return data.map((row) => ({
          id: row.id,
          order: row.merchant_order,
          kind: row.kind as Payment['kind'],
          plan: row.plan as PaidPlan,
          period: row.period as Interval,
          amountCents: row.amount_cents,
          chargedCents: row.charge_cents ?? null,
          referralCreditCents: row.referral_credit_cents ?? null,
          netCents: row.net_cents,
          vatPercent: row.vat_percent,
          status: row.status as PaymentStatus,
          createdAt: new Date(row.created_at),
          settledAt: row.settled_at ? new Date(row.settled_at) : null,
          invoiceNumber: row.invoice_number,
          invoicePortalUrl: row.invoice_portal_url,
        }))
      } catch {
        throw new Error('No se pudo cargar el historial de pagos.')
      } finally {
        clearTimeout(timer)
      }
    },
  })

type RedsysForm = {
  url: string
  signatureVersion: string
  merchantParameters: string
  signature: string
}

export type BillingResult =
  | { ok: true; form?: RedsysForm; paidByBalance?: boolean }
  | { ok: false; message: string }

async function call(body: Record<string, unknown>): Promise<BillingResult> {
  const { data, error } = await createBrowserSupabaseClient().functions.invoke<{
    form?: RedsysForm
    paidByBalance?: boolean
  }>('billing', { body })
  if (error) {
    const body: unknown =
      error.context instanceof Response ? await error.context.json().catch(() => null) : null
    const message = body && typeof body === 'object' && 'error' in body ? body.error : null
    return {
      ok: false,
      message:
        typeof message === 'string'
          ? message
          : 'No se pudo completar la operación. Inténtalo de nuevo.',
    }
  }
  return data?.form
    ? { ok: true, form: data.form }
    : { ok: true, paidByBalance: data?.paidByBalance === true }
}

/** Sends the browser to Redsys' hosted card page (the card never touches our servers). */
export function submitToRedsys(form: RedsysForm) {
  const element = document.createElement('form')
  element.method = 'POST'
  element.action = form.url
  const fields = {
    Ds_SignatureVersion: form.signatureVersion,
    Ds_MerchantParameters: form.merchantParameters,
    Ds_Signature: form.signature,
  }
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    element.append(input)
  }
  document.body.append(element)
  element.submit()
}

/** First payment: Redsys asks for the card and keeps a reference for the next charges. */
export const acceptBillingTerms = (
  tenantId: string,
  action: 'checkout' | 'change' | 'retry',
  terms: BillingTerms,
) =>
  call({
    action,
    tenantId,
    plan: terms.plan,
    interval: terms.period,
    seats: terms.seats,
    total: terms.amount_cents,
  })

/** Cancel (or resume) at the end of the paid period. */
export const cancelPlan = (tenantId: string) => call({ action: 'cancel', tenantId })
export const resumePlan = (tenantId: string) => call({ action: 'resume', tenantId })
export const undoPlanChange = (tenantId: string) => call({ action: 'undo', tenantId })
