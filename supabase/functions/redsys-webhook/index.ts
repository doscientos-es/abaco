/**
 * Aviso de Redsys tras cada cobro. Se despliega con --no-verify-jwt: la autenticidad
 * la da la firma de Redsys, no un token de usuario.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

import { isSuccess, readNotification, readRedsysConfig, sealReference } from '../_shared/redsys.ts'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Método no permitido', { status: 405 })
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const config = readRedsysConfig()
  if (!url || !serviceKey || !config) return new Response('Sin configurar', { status: 500 })

  let parameters = ''
  let signature = ''
  if ((request.headers.get('content-type') ?? '').includes('json')) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    parameters = typeof body.Ds_MerchantParameters === 'string' ? body.Ds_MerchantParameters : ''
    signature = typeof body.Ds_Signature === 'string' ? body.Ds_Signature : ''
  } else {
    const form = await request.formData().catch(() => null)
    const rawParameters = form?.get('Ds_MerchantParameters')
    const rawSignature = form?.get('Ds_Signature')
    parameters = typeof rawParameters === 'string' ? rawParameters : ''
    signature = typeof rawSignature === 'string' ? rawSignature : ''
  }

  const notice = readNotification(config, parameters, signature)
  if (!notice) return new Response('Firma no válida', { status: 400 })
  if (
    notice.merchantCode !== config.merchantCode ||
    notice.terminal !== config.terminal ||
    notice.currency !== config.currency
  ) {
    return new Response('Contexto no válido', { status: 400 })
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: payment } = await admin
    .from('billing_payments')
    .select('amount_cents')
    .eq('merchant_order', notice.order)
    .maybeSingle()
  if (!payment) return new Response('Operación desconocida', { status: 200 })
  if (payment.amount_cents !== notice.amountCents)
    return new Response('Importe no coincide', { status: 400 })

  const succeeded = isSuccess(notice.code)
  const { error } = await admin.rpc('apply_billing_payment', {
    p_order: notice.order,
    p_succeeded: succeeded,
    p_code: notice.code,
    p_reference: succeeded && notice.identifier ? sealReference(notice.identifier) : null,
  })
  if (error) return new Response('No se pudo aplicar', { status: 500 })
  return new Response('ok', { status: 200 })
})
