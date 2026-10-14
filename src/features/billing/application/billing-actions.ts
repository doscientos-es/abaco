import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import type { Interval, PaidPlan, Plan } from '../domain/plans'

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export type Subscription = {
  plan: Plan
  status: SubscriptionStatus
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
const plans: readonly string[] = ['trial', 'solo', 'team', 'business']

export function describeSubscription(row: {
  plan: string
  subscription_status: string
  trial_ends_at: string
  billing_interval: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  next_plan: string | null
  next_interval: string | null
}): Subscription {
  const status = (statuses.includes(row.subscription_status) ? row.subscription_status : 'canceled') as SubscriptionStatus
  const trialEndsAt = new Date(row.trial_ends_at)
  const trialActive = status === 'trialing' && trialEndsAt.getTime() > Date.now()
  return {
    plan: (plans.includes(row.plan) ? row.plan : 'trial') as Plan,
    status,
    trialEndsAt,
    interval: row.billing_interval === 'year' || row.billing_interval === 'month' ? row.billing_interval : null,
    currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end) : null,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    nextPlan: row.next_plan === 'solo' || row.next_plan === 'team' || row.next_plan === 'business' ? row.next_plan : null,
    nextInterval: row.next_interval === 'year' || row.next_interval === 'month' ? row.next_interval : null,
    canWrite: trialActive || status === 'active' || status === 'past_due',
    trialDaysLeft: trialActive ? Math.max(1, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000)) : 0,
  }
}

export const subscriptionQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['subscription', tenantId],
    staleTime: 60_000,
    queryFn: async (): Promise<Subscription> => {
      const { data, error } = await createBrowserSupabaseClient()
        .from('tenants')
        .select('plan, subscription_status, trial_ends_at, billing_interval, current_period_end, cancel_at_period_end, next_plan, next_interval')
        .eq('id', tenantId)
        .single()
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
  status: PaymentStatus
  createdAt: Date
  settledAt: Date | null
}

/** Every charge attempt of the company, newest first. Only the owner can read them (RLS). */
export const paymentsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ['billing-payments', tenantId],
    staleTime: 60_000,
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await createBrowserSupabaseClient()
        .from('billing_payments')
        .select('id, merchant_order, kind, plan, period, amount_cents, status, created_at, settled_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
      if (error) throw new Error('No se pudo cargar el historial de pagos.')
      return data.map((row) => ({
        id: row.id,
        order: row.merchant_order,
        kind: row.kind as Payment['kind'],
        plan: row.plan as PaidPlan,
        period: row.period as Interval,
        amountCents: row.amount_cents,
        status: row.status as PaymentStatus,
        createdAt: new Date(row.created_at),
        settledAt: row.settled_at ? new Date(row.settled_at) : null,
      }))
    },
  })

type RedsysForm = { url: string; signatureVersion: string; merchantParameters: string; signature: string }

export type BillingResult = { ok: true; form?: RedsysForm } | { ok: false; message: string }

async function call(body: Record<string, unknown>): Promise<BillingResult> {
  const { data, error } = await createBrowserSupabaseClient().functions.invoke<{ form?: RedsysForm }>('billing', { body })
  if (error) return { ok: false, message: 'No se pudo completar la operación. Inténtalo de nuevo.' }
  return data?.form ? { ok: true, form: data.form } : { ok: true }
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
export const startCheckout = (tenantId: string, plan: PaidPlan, interval: Interval) =>
  call({ action: 'checkout', tenantId, plan, interval })

/** Plan change for an active subscription: applied on the next renewal. */
export const changePlan = (tenantId: string, plan: PaidPlan, interval: Interval) =>
  call({ action: 'change', tenantId, plan, interval })

/** Cancel (or resume) at the end of the paid period. */
export const cancelPlan = (tenantId: string) => call({ action: 'cancel', tenantId })
export const resumePlan = (tenantId: string) => call({ action: 'resume', tenantId })
