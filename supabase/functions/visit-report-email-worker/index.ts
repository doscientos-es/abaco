import { createClient } from 'npm:@supabase/supabase-js@2'

import { dispatchVisitReportEmail } from '../_shared/visit-report-email-dispatch.ts'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Método no permitido', { status: 405 })
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || request.headers.get('x-cron-secret') !== secret)
    return new Response('No autorizado', { status: 401 })
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key || !Deno.env.get('REPORT_DELIVERY_KEY'))
    return new Response('Sin configurar', { status: 503 })
  const admin = createClient(url, key, { auth: { persistSession: false } })
  let processed = 0
  try {
    while (processed < 20 && (await dispatchVisitReportEmail(admin))) processed++
  } catch {
    return new Response(JSON.stringify({ processed, error: 'dispatch_failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ processed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
