import { createClient } from 'npm:@supabase/supabase-js@2'

import { dispatchContractInvoiceEmail } from '../_shared/contract-invoice-dispatch.ts'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret.length > 256) return new Response(null, { status: 401 })
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const configuredFrom = Deno.env.get('RESEND_FROM')
  if (!url || !key || !configuredFrom || !Deno.env.get('RESEND_API_KEY'))
    return new Response('Sin configurar', { status: 503 })
  const admin = createClient(url, key, { auth: { persistSession: false } })
  const auth = await admin.rpc('authorize_contract_invoice_worker', { p_secret: secret })
  if (auth.error) return new Response(null, { status: 503 })
  if (auth.data !== true) return new Response(null, { status: 401 })
  const sender = (/<([^>]+)>/.exec(configuredFrom)?.[1] ?? configuredFrom).trim()
  const startedAt = performance.now()
  let processed = 0
  try {
    while (processed < 10 && performance.now() - startedAt < 40_000) {
      if (!(await dispatchContractInvoiceEmail(admin, sender))) break
      processed++
    }
  } catch {
    // Never log recipients, credentials, fiscal snapshots or provider response bodies.
    return Response.json({ processed, error: 'dispatch_failed' }, { status: 502 })
  }
  return Response.json({ processed })
})
