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
        .select('plan, subscription_status, trial_ends_at, billing_interval, current_period_end, cancel_at_period_end')
        .eq('id', tenantId)
        .single()
      if (error) throw new Error('No se pudo cargar el plan.')
      return describeSubscription(data)
    },
  })

export type BillingResult = { ok: true; url: string } | { ok: false; message: string }

async function call(body: Record<string, unknown>): Promise<BillingResult> {
  const { data, error } = await createBrowserSupabaseClient().functions.invoke<{ url?: string }>('billing', { body })
  if (error || !data?.url) return { ok: false, message: 'No se pudo abrir el pago. Inténtalo de nuevo.' }
  return { ok: true, url: data.url }
}

/** Stripe Checkout for a new subscription. */
export const startCheckout = (tenantId: string, plan: PaidPlan, interval: Interval) =>
  call({ action: 'checkout', tenantId, plan, interval })

/** Stripe customer portal: change plan, update card, download receipts, cancel. */
export const openPortal = (tenantId: string) => call({ action: 'portal', tenantId })
