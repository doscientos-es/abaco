/**
 * Recibe los avisos de Stripe y actualiza el plan de la empresa. Stripe es la fuente de verdad.
 * La firma se verifica con STRIPE_WEBHOOK_SECRET; sin firma válida no se hace nada.
 * Despliega con --no-verify-jwt: Stripe no manda token de Supabase.
 *
 * Eventos a activar en Stripe: customer.subscription.created, customer.subscription.updated,
 * customer.subscription.deleted.
 * Secretos: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'

const statusMap: Record<string, string> = {
  active: 'active',
  trialing: 'active',
  past_due: 'past_due',
  unpaid: 'canceled',
  canceled: 'canceled',
  incomplete: 'canceled',
  incomplete_expired: 'canceled',
  paused: 'canceled',
}

Deno.serve(async (request) => {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const signature = request.headers.get('stripe-signature')
  if (!url || !serviceKey || !stripeKey || !secret) return new Response('Sin configurar', { status: 500 })
  if (!signature) return new Response('Falta la firma', { status: 400 })

  const stripe = new Stripe(stripeKey)
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, secret)
  } catch {
    return new Response('Firma no válida', { status: 400 })
  }

  if (!event.type.startsWith('customer.subscription.')) return new Response('ok')

  const subscription = event.data.object as Stripe.Subscription
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  const item = subscription.items.data[0]
  const lookupKey = item?.price.lookup_key ?? ''
  const [plan, interval] = lookupKey.split('_')
  const status = event.type === 'customer.subscription.deleted' ? 'canceled' : (statusMap[subscription.status] ?? 'canceled')

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  // La empresa se identifica por su cliente de Stripe (lo guardó la función billing).
  const { data: tenant } = await admin.from('tenants').select('id, stripe_subscription_id').eq('stripe_customer_id', customerId).maybeSingle()
  if (!tenant) return new Response('Empresa desconocida', { status: 200 })
  // Ignora avisos de una suscripción antigua ya sustituida por otra.
  if (tenant.stripe_subscription_id && tenant.stripe_subscription_id !== subscription.id && status === 'canceled') {
    return new Response('ok')
  }

  const periodEnd = item?.current_period_end ?? null
  const { error } = await admin
    .from('tenants')
    .update({
      plan: ['solo', 'team', 'business'].includes(plan ?? '') ? plan : 'solo',
      billing_interval: interval === 'year' ? 'year' : 'month',
      subscription_status: status,
      stripe_subscription_id: subscription.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
    })
    .eq('id', tenant.id)
  // 500: Stripe reintenta el aviso más tarde.
  if (error) return new Response('Error al guardar', { status: 500 })
  return new Response('ok')
})
