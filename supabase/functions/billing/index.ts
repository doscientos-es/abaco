/**
 * Pagos con Redsys. Solo el propietario de la empresa puede usarla.
 *
 * Body: { action: 'checkout', tenantId, plan, interval }  -> { form } (el navegador lo envía a Redsys)
 *    o: { action: 'change', tenantId, plan, interval }    -> cambio de plan en la próxima renovación
 *    o: { action: 'cancel' | 'resume', tenantId }         -> cancelar / retomar al final del periodo
 * Secretos: REDSYS_*, APP_URL.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

import { firstPaymentForm, newMerchantOrder, readRedsysConfig } from '../_shared/redsys.ts'

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
  const appUrl = Deno.env.get('APP_URL')
  const config = readRedsysConfig()
  const authorization = request.headers.get('Authorization')
  if (!url || !anonKey || !serviceKey || !appUrl || !config) return reply(500, { error: 'Función sin configurar' })
  if (!authorization) return reply(401, { error: 'Inicia sesión' })

  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: caller } = await asCaller.auth.getUser()
  if (!caller.user) return reply(401, { error: 'Sesión no válida' })

  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const tenantId = typeof input?.tenantId === 'string' ? input.tenantId : ''
  if (!uuidPattern.test(tenantId)) return reply(400, { error: 'Datos no válidos' })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: mine } = await admin
    .from('memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', caller.user.id)
    .maybeSingle()
  if (mine?.role !== 'owner') return reply(403, { error: 'Solo el propietario puede gestionar el plan' })

  const { data: tenant } = await admin.from('tenants').select('subscription_status').eq('id', tenantId).single()
  if (!tenant) return reply(404, { error: 'Empresa no encontrada' })
  const subscribed = ['active', 'past_due'].includes(tenant.subscription_status)

  if (input?.action === 'cancel' || input?.action === 'resume') {
    if (tenant.subscription_status !== 'active') return reply(400, { error: 'No hay suscripción activa' })
    await admin.from('tenants').update({ cancel_at_period_end: input.action === 'cancel' }).eq('id', tenantId)
    return reply(200, { ok: true })
  }

  const plan = String(input?.plan)
  const interval = String(input?.interval)
  if (input?.action !== 'checkout' && input?.action !== 'change') return reply(400, { error: 'Acción no válida' })
  if (!plans.includes(plan) || !intervals.includes(interval)) return reply(400, { error: 'Plan no válido' })

  if (input.action === 'change') {
    if (tenant.subscription_status !== 'active') return reply(400, { error: 'No hay suscripción activa' })
    await admin.from('tenants').update({ next_plan: plan, next_interval: interval }).eq('id', tenantId)
    return reply(200, { ok: true })
  }
  // Con suscripción activa se usa 'change': un primer pago nuevo cobraría dos veces.
  if (tenant.subscription_status === 'active') return reply(400, { error: 'Ya tienes un plan activo' })

  const { data: amount } = await admin.rpc('plan_charge_cents', { p_plan: plan, p_interval: interval })
  if (typeof amount !== 'number') return reply(500, { error: 'Precio sin configurar' })

  const order = newMerchantOrder()
  const { error } = await admin.from('billing_payments').insert({
    tenant_id: tenantId, merchant_order: order, kind: 'first', plan, period: interval, amount_cents: amount,
  })
  if (error) return reply(500, { error: 'No se pudo preparar el pago' })

  const form = firstPaymentForm({
    config, order, amountCents: amount,
    notifyUrl: `${url}/functions/v1/redsys-webhook`,
    okUrl: `${appUrl}/ajustes?pago=ok`,
    koUrl: `${appUrl}/ajustes?pago=cancelado`,
  })
  return reply(200, { form, subscribed })
})
