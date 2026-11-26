import { createClient } from 'npm:@supabase/supabase-js@2'

import { isCronAuthorized } from '../_shared/cron-auth.ts'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  if (!isCronAuthorized(request, Deno.env.get('CRON_SECRET') ?? ''))
    return new Response(null, { status: 401 })

  const project = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const endpoint = Deno.env.get('MENOSLIOS_CRM_ENDPOINT')
  const secret = Deno.env.get('MENOSLIOS_CRM_SECRET')
  if (!project || !serviceKey || !endpoint || !secret || secret.length < 32)
    return new Response(null, { status: 503 })
  const url = URL.parse(endpoint)
  if (!url || url.protocol !== 'https:' || url.username || url.password)
    return new Response(null, { status: 503 })

  const admin = createClient(project, serviceKey, { auth: { persistSession: false } })
  const { data, error } = await admin.rpc('claim_menoslios_crm_event')
  if (error) return new Response(null, { status: 503 })
  const job = data?.[0]
  if (!job) return new Response(null, { status: 204 })

  let delivered = false
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(job.payload),
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    })
    delivered = response.ok
  } catch {
    // The lease and backoff retain the job if the backoffice is unavailable.
  }
  const result = await admin.rpc('finish_menoslios_crm_event', {
    p_id: job.id,
    p_lease: job.lease_id,
    p_delivered: delivered,
  })
  return new Response(null, { status: result.error || !result.data || !delivered ? 503 : 204 })
})
