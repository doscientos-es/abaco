import { createClient } from 'npm:@supabase/supabase-js@2'

import { bookingConfirmation, validCalSignature } from '../_shared/onboarding-cal.ts'
import { renamedEnv } from '../_shared/renamed-env.ts'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  const projectUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const secret = renamedEnv('CAL_WEBHOOK_SECRET')
  const eventType = renamedEnv('CAL_EVENT_TYPE_ID')
  if (!projectUrl || !serviceKey || !secret || !eventType)
    return new Response('Reserva sin configurar', { status: 503 })

  const signature = request.headers.get('x-cal-signature-256') ?? ''
  if (Number(request.headers.get('content-length')) > 65536)
    return new Response(null, { status: 413 })
  const raw = await request.text()
  if (raw.length > 65536) return new Response(null, { status: 413 })
  if (!validCalSignature(raw, signature, secret)) return new Response(null, { status: 401 })

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return new Response(null, { status: 400 })
  }
  const confirmation = bookingConfirmation(parsed, eventType)
  if (!confirmation) return new Response(null, { status: 204 })

  const admin = createClient(projectUrl, serviceKey, { auth: { persistSession: false } })
  const { error } = await admin.rpc('confirm_onboarding_booking', confirmation)
  return new Response(null, { status: error ? 503 : 204 })
})
