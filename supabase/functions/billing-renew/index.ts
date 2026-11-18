/**
 * Cobro mensual/anual automático. Se lanza una vez al día (cron) con la cabecera
 * `x-cron-secret` igual al secreto CRON_SECRET. Despliegue con --no-verify-jwt.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

import { isCronAuthorized } from '../_shared/cron-auth.ts'
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
  if (!isCronAuthorized(request, cronSecret)) return new Response('No autorizado', { status: 401 })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { error: expiryError } = await admin.rpc('expire_subscriptions')
  const { data: due, error: dueError } = await admin.rpc('billing_due_renewals')
  if (expiryError || dueError)
    return new Response('No se pudieron cargar las renovaciones', { status: 500 })

  let charged = 0
  let failed = 0
  for (const row of (due ?? []) as {
    tenant_id: string
    redsys_reference: string
  }[]) {
    const order = newMerchantOrder()
    const { data: amount, error } = await admin.rpc('billing_reserve_renewal', {
      p_tenant: row.tenant_id,
      p_order: order,
    })
    if (error) failed++
    if (error || typeof amount !== 'number') continue
    try {
      const result = await chargeReference({
        config,
        order,
        amountCents: amount,
        reference: openReference(row.redsys_reference),
      })
      const { error: settlementError } = await admin.rpc('apply_billing_payment', {
        p_order: order,
        p_succeeded: result.ok,
        p_code: result.code,
        p_reference: null,
      })
      if (result.ok && !settlementError) charged++
      else failed++
    } catch {
      failed++
    }
  }
  return Response.json({ charged, failed })
})
