/**
 * Pagos con Redsys. Solo los administradores de la empresa pueden usarla.
 *
 * checkout/change/retry send the amount confirmed by the customer; the database verifies it.
 * cancel/resume/undo manage already scheduled subscription changes.
 * Secretos: REDSYS_*, APP_URL.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

import { firstPaymentForm, newMerchantOrder, readRedsysConfig } from '../_shared/redsys.ts'
import { prepareCharge } from '../_shared/subscription-invoices.ts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') ?? '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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
  if (!url || !anonKey || !serviceKey || !appUrl || !config)
    return reply(500, { error: 'Función sin configurar' })
  if (!authorization) return reply(401, { error: 'Inicia sesión' })

  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: caller } = await asCaller.auth.getUser()
  if (!caller.user) return reply(401, { error: 'Sesión no válida' })

  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const tenantId = typeof input?.tenantId === 'string' ? input.tenantId : ''
  if (!uuidPattern.test(tenantId)) return reply(400, { error: 'Datos no válidos' })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const order = newMerchantOrder()
  const action = typeof input?.action === 'string' ? input.action : null
  const isOnboarding = action === 'onboarding-checkout'
  const isCharge = isOnboarding || action === 'checkout' || action === 'retry'
  const modules = input?.modules
  if (isOnboarding) {
    const bookingUrl = Deno.env.get('ABACO_CAL_BOOKING_URL')
    const eventType = Deno.env.get('ABACO_CAL_EVENT_TYPE_ID')
    const secret = Deno.env.get('ABACO_CAL_WEBHOOK_SECRET')
    if (
      !bookingUrl ||
      bookingUrl !== input?.bookingUrl ||
      !eventType ||
      !/^\d+$/.test(eventType) ||
      !secret
    )
      return reply(409, {
        error: 'La agenda de puesta en marcha no está disponible. No se ha iniciado ningún cobro.',
      })
    if (
      !Array.isArray(modules) ||
      modules.length > 3 ||
      modules.some(
        (code: unknown) =>
          typeof code !== 'string' || !['workers', 'procurement', 'ai'].includes(code),
      )
    )
      return reply(400, { error: 'Módulos no válidos' })
  }
  if (!isOnboarding && isCharge) {
    const { data: onboarding, error: onboardingError } = await asCaller.rpc(
      'company_onboarding_status',
      { p_tenant: tenantId },
    )
    if (onboardingError) return reply(403, { error: 'No se pudo comprobar el alta' })
    if (onboarding && onboarding.stage !== 'complete') {
      return reply(409, { error: 'Continúa en el alta guiada para activar tu empresa.' })
    }
  }
  let profile = null
  if (isCharge) {
    if (config.environment !== 'prod' || config.currency !== '978') {
      return reply(409, { error: 'El cobro de suscripciones no está habilitado.' })
    }
    // RLS restricts the preflight (which can create a CRM client) to this company's admins.
    const prepared = await prepareCharge(asCaller, tenantId)
    if (!prepared.profile) return reply(409, { error: prepared.message })
    profile = prepared.profile
  }
  const args = {
    p_tenant: tenantId,
    p_actor: caller.user.id,
    p_action: action,
    p_plan: typeof input?.plan === 'string' ? input.plan : null,
    p_period: typeof input?.interval === 'string' ? input.interval : null,
    p_seats:
      typeof input?.seats === 'number' && Number.isSafeInteger(input.seats) ? input.seats : null,
    p_expected_total:
      typeof input?.total === 'number' && Number.isSafeInteger(input.total) ? input.total : null,
    p_order: order,
  }
  const { data: amount, error } = profile
    ? isOnboarding
      ? await admin.rpc('reserve_onboarding_payment', {
          p_tenant: tenantId,
          p_recipient: profile,
          p_order: order,
          p_actor: caller.user.id,
          p_period: args.p_period,
          p_seats: args.p_seats,
          p_expected_total: args.p_expected_total,
          p_modules: [...new Set(modules as string[])],
        })
      : await admin.rpc('reserve_subscription_invoice_payment', { ...args, p_recipient: profile })
    : await admin.rpc('billing_manage', args)
  if (error) {
    if (error.code === '42501')
      return reply(403, { error: 'Solo un administrador puede gestionar el plan' })
    if (['P0001', 'P0403', '22023'].includes(error.code))
      return reply(409, { error: error.message })
    return reply(500, { error: 'No se pudo gestionar la facturación' })
  }
  if (!isCharge) return reply(200, { ok: true })
  // A zero total has already been settled atomically by the reservation RPC.
  if (amount === 0) return reply(200, { ok: true, paidByBalance: true })
  if (typeof amount !== 'number' || amount < 0) return reply(500, { error: 'Precio no disponible' })

  const form = firstPaymentForm({
    config,
    order,
    amountCents: amount,
    notifyUrl: `${url}/functions/v1/redsys-webhook`,
    okUrl: isOnboarding ? `${appUrl}/bienvenida?pago=ok` : `${appUrl}/ajustes?pago=ok`,
    koUrl: isOnboarding
      ? `${appUrl}/bienvenida?pago=cancelado`
      : `${appUrl}/ajustes?pago=cancelado`,
  })
  return reply(200, { form })
})
