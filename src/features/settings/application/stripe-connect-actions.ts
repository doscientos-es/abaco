import { queryOptions } from '@tanstack/react-query'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

async function stripeRequest(tenantId: string, action: 'start' | 'status') {
  const { data, error } = await createBrowserSupabaseClient().auth.getSession()
  if (error || !data.session?.access_token) throw new Error('Sesión no disponible.')
  const response = await fetch('/api/stripe_connect_authorize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ tenantId, action }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Stripe no está disponible.')
  return (await response.json()) as unknown
}

export async function beginStripeConnection(tenantId: string): Promise<string> {
  const payload = await stripeRequest(tenantId, 'start')
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('url' in payload) ||
    typeof payload.url !== 'string'
  )
    throw new Error('Stripe no devolvió una dirección válida.')
  const url = new URL(payload.url)
  if (url.origin !== 'https://connect.stripe.com' || url.username || url.password)
    throw new Error('Stripe devolvió una dirección no válida.')
  return url.toString()
}

export async function getStripeConnection(tenantId: string) {
  const payload = await stripeRequest(tenantId, 'status')
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('connected' in payload) ||
    typeof payload.connected !== 'boolean' ||
    !('liveMode' in payload) ||
    typeof payload.liveMode !== 'boolean'
  )
    throw new Error('No se pudo consultar la conexión de Stripe.')
  return { connected: payload.connected, liveMode: payload.liveMode }
}

export function stripeConnectionQuery(tenantId: string) {
  return queryOptions({
    queryKey: ['settings', 'stripe-connect', tenantId],
    queryFn: () => getStripeConnection(tenantId),
    enabled: Boolean(tenantId),
  })
}
