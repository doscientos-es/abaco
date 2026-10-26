/**
 * Cobro mensual/anual automático. Se lanza una vez al día (cron) con la cabecera
 * `x-cron-secret` igual al secreto CRON_SECRET. Despliegue con --no-verify-jwt.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  chargeReference,
  newMerchantOrder,
  openReference,
  readRedsysConfig,
} from '../_shared/redsys.ts'

Deno.serve(async (request) => {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const cronSecret = Deno.env.get('CRON_SECRET')
  const config = readRedsysConfig()
  if (!url || !serviceKey || !cronSecret || !config)
    return new Response('Sin configurar', { status: 500 })
  if (request.headers.get('x-cron-secret') !== cronSecret)
    return new Response('No autorizado', { status: 401 })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  await admin.rpc('expire_subscriptions')
  const { data: due } = await admin.rpc('billing_due_renewals')

  let charged = 0
  let failed = 0
  for (const row of (due ?? []) as {
    tenant_id: string
    plan: string
    period: string
    redsys_reference: string
  }[]) {
    const order = newMerchantOrder()
    const { data: amount } = await admin.rpc('plan_charge_cents', {
      p_plan: row.plan,
      p_interval: row.period,
    })
    if (typeof amount !== 'number') continue
    // El intento se registra antes de cobrar: si algo falla a medias, no se repite en 20 h.
    const { error } = await admin.from('billing_payments').insert({
      tenant_id: row.tenant_id,
      merchant_order: order,
      kind: 'renewal',
      plan: row.plan,
      period: row.period,
      amount_cents: amount,
    })
    if (error) continue
    try {
      const result = await chargeReference({
        config,
        order,
        amountCents: amount,
        reference: openReference(row.redsys_reference),
      })
      await admin.rpc('apply_billing_payment', {
        p_order: order,
        p_succeeded: result.ok,
        p_code: result.code,
        p_reference: null,
      })
      if (result.ok) charged++
      else failed++
    } catch {
      failed++
    }
  }
  return Response.json({ charged, failed })
})
