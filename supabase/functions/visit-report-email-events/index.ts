/** Resend webhook: retain verified delivery outcomes without email content. */
import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  parseReportEmailProviderEvent,
  verifyResendWebhook,
} from '../_shared/visit-report-email-events.ts'

function reply(status: number, state: string) {
  return new Response(JSON.stringify({ status: state }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, 'method_not_allowed')
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret || !url || !serviceKey) return reply(503, 'not_configured')
  if (Number(request.headers.get('content-length') ?? 0) > 65_536)
    return reply(413, 'payload_too_large')
  const rawBody = await request.text()
  if (rawBody.length > 65_536) return reply(413, 'payload_too_large')
  if (!(await verifyResendWebhook(rawBody, request.headers, secret)))
    return reply(401, 'invalid_signature')
  const event = parseReportEmailProviderEvent(rawBody, request.headers.get('svix-id') ?? '')
  if (!event) return reply(200, 'ignored')

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { error } = await admin.from('service_visit_report_email_provider_events').insert(event)
  if (error && error.code !== '23505') {
    // eslint-disable-next-line no-console -- log only the provider-independent database code
    console.error('Resend report event storage failed:', error.code)
    return reply(500, 'storage_failed')
  }
  return reply(200, error ? 'duplicate' : 'recorded')
})
