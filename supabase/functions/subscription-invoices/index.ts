import { createClient } from 'npm:@supabase/supabase-js@2'

import { isCronAuthorized } from '../_shared/cron-auth.ts'
import {
  handoffResult,
  hasInvoiceIntegration,
  requestBackoffice,
} from '../_shared/subscription-invoices.ts'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || !isCronAuthorized(request, cronSecret)) {
    return new Response(null, { status: 401 })
  }
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key || !hasInvoiceIntegration()) return new Response(null, { status: 503 })

  const admin = createClient(url, key, { auth: { persistSession: false } })
  let processed = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin.rpc('claim_subscription_invoice_handoff')
    if (error) return new Response(null, { status: 503 })
    const job = data?.[0]
    if (!job) break
    const result = handoffResult(await requestBackoffice({ action: 'issue', payment: job.payload }))
    const { data: updated, error: finishError } = await admin.rpc(
      'finish_subscription_invoice_handoff',
      {
        p_payment: job.payment_id,
        p_lease: job.lease_id,
        p_number: result.number,
        p_url: result.url,
        p_status: result.status,
      },
    )
    if (finishError || !updated) return new Response(null, { status: 503 })
    processed++
  }
  return Response.json({ processed })
})
