/**
 * Pagos con Stripe. Solo el propietario de la empresa puede usarla.
 *
 * Body: { action: 'checkout', tenantId, plan: 'solo' | 'team' | 'business', interval: 'month' | 'year' }
 *    o: { action: 'portal', tenantId }
 * Responde { url } para redirigir al navegador a Stripe.
 *
 * Los precios se buscan por su lookup_key en Stripe: `solo_month`, `solo_year`, `team_month`, ...
 * Secretos: STRIPE_SECRET_KEY, APP_URL.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'

const plans = ['solo', 'team', 'business']
const intervals = ['month', 'year']
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') ?? '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return reply(405, { error: 'Método no permitido' })

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const appUrl = Deno.env.get('APP_URL')
  const authorization = request.headers.get('Authorization')
  if (!url || !anonKey || !serviceKey || !stripeKey || !appUrl) return reply(500, { error: 'Función sin configurar' })
  if (!authorization) return reply(401, { error: 'Inicia sesión' })

  // Identidad real, tomada del token.
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: caller } = await asCaller.auth.getUser()
  if (!caller.user) return reply(401, { error: 'Sesión no válida' })

  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const tenantId = typeof input?.tenantId === 'string' ? input.tenantId : ''
  if (!uuidPattern.test(tenantId)) return reply(400, { error: 'Datos no válidos' })

  // Solo el propietario gestiona el pago.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: mine } = await admin
    .from('memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', caller.user.id)
    .maybeSingle()
  if (mine?.role !== 'owner') return reply(403, { error: 'Solo el propietario puede gestionar el plan' })

  const { data: tenant } = await admin
    .from('tenants')
    .select('name, stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('id', tenantId)
    .single()
  if (!tenant) return reply(404, { error: 'Empresa no encontrada' })

  const stripe = new Stripe(stripeKey)
  const returnUrl = `${appUrl}/ajustes`

  // Cliente de Stripe: se crea una vez por empresa.
  let customer = tenant.stripe_customer_id
  if (!customer) {
    const created = await stripe.customers.create({
      name: tenant.name,
      email: caller.user.email ?? undefined,
      metadata: { tenant_id: tenantId },
    })
    customer = created.id
    await admin.from('tenants').update({ stripe_customer_id: customer }).eq('id', tenantId)
  }

  if (input?.action === 'portal') {
    const portal = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl })
    return reply(200, { url: portal.url })
  }

  if (input?.action === 'checkout') {
    const plan = String(input.plan)
    const interval = String(input.interval)
    if (!plans.includes(plan) || !intervals.includes(interval)) return reply(400, { error: 'Plan no válido' })
    // Con una suscripción viva, los cambios de plan van por el portal (evita cobrar dos veces).
    if (tenant.stripe_subscription_id && ['active', 'past_due'].includes(tenant.subscription_status)) {
      const portal = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl })
      return reply(200, { url: portal.url })
    }
    const prices = await stripe.prices.list({ lookup_keys: [`${plan}_${interval}`], active: true, limit: 1 })
    const price = prices.data[0]
    if (!price) return reply(500, { error: 'Precio sin configurar en Stripe' })
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: `${returnUrl}?pago=ok`,
      cancel_url: `${returnUrl}?pago=cancelado`,
      allow_promotion_codes: true,
      client_reference_id: tenantId,
      subscription_data: { metadata: { tenant_id: tenantId, plan, interval } },
    })
    return reply(200, { url: session.url })
  }

  return reply(400, { error: 'Acción no válida' })
})
