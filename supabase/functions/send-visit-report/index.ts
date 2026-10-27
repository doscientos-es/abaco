/** Queue and attempt one report email for a customer-owned address. */
import { createClient } from 'npm:@supabase/supabase-js@2'

import { dispatchVisitReportEmail } from '../_shared/visit-report-email-dispatch.ts'
import { encryptReportToken } from '../_shared/visit-report-email.ts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tokenPattern = /^[0-9a-f]{64}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') ?? '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
  'Cache-Control': 'no-store',
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function senderAddress(value: string) {
  const address = /<([^>]+)>/.exec(value)?.[1] ?? value
  return emailPattern.test(address) ? address : ''
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const deliveryKey = Deno.env.get('REPORT_DELIVERY_KEY')
  const configuredFrom = Deno.env.get('RESEND_FROM') ?? ''
  const fromAddress = senderAddress(configuredFrom)
  const configuredAppUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '')
  if (!url || !anonKey || !serviceKey || !deliveryKey || !fromAddress || !configuredAppUrl)
    return reply(503, { error: 'not_configured' })
  let appUrl: URL
  try {
    appUrl = new URL(configuredAppUrl)
    if (appUrl.protocol !== 'https:' && appUrl.hostname !== 'localhost') throw new Error()
  } catch {
    return reply(503, { error: 'not_configured' })
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization) return reply(401, { error: 'unauthorized' })
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: caller } = await asCaller.auth.getUser()
  if (!caller.user) return reply(401, { error: 'unauthorized' })

  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const tenantId = typeof input?.tenantId === 'string' ? input.tenantId : ''
  const reportVersionId = typeof input?.reportVersionId === 'string' ? input.reportVersionId : ''
  const operationId = typeof input?.operationId === 'string' ? input.operationId : ''
  const token = typeof input?.token === 'string' ? input.token : ''
  if (
    !uuidPattern.test(tenantId) ||
    !uuidPattern.test(reportVersionId) ||
    !uuidPattern.test(operationId) ||
    !tokenPattern.test(token)
  )
    return reply(400, { error: 'invalid_input' })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: membership } = await admin
    .from('memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', caller.user.id)
    .maybeSingle()
  if (!membership || !['owner', 'admin'].includes(membership.role))
    return reply(403, { error: 'forbidden' })

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const tokenHash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  const { data: share, error: shareError } = await admin
    .from('service_visit_report_shares')
    .select('id,tenant_id,report_version_id,expires_at,revoked_at')
    .eq('tenant_id', tenantId)
    .eq('report_version_id', reportVersionId)
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (
    shareError ||
    !share ||
    share.revoked_at ||
    new Date(share.expires_at).getTime() <= Date.now()
  )
    return reply(404, { error: 'share_unavailable' })

  const { data: version, error: versionError } = await admin
    .from('service_visit_report_versions')
    .select('snapshot')
    .eq('id', reportVersionId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (versionError || !version) return reply(404, { error: 'report_unavailable' })
  const snapshot = version.snapshot as Record<string, Record<string, unknown>>
  const clientId = snapshot?.client?.id
  if (typeof clientId !== 'string' || !uuidPattern.test(clientId))
    return reply(500, { error: 'report_invalid' })
  const [{ data: client }, { data: tenant }] = await Promise.all([
    admin
      .from('clients')
      .select('name,email')
      .eq('id', clientId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    admin.from('tenants').select('name,email,email_from_name').eq('id', tenantId).maybeSingle(),
  ])
  if (!client || !tenant) return reply(404, { error: 'recipient_unavailable' })
  let recipientEmail = String(client.email ?? '').trim()
  let recipientName = String(client.name ?? '').trim()
  if (!emailPattern.test(recipientEmail)) {
    const { data: contact } = await admin
      .from('client_contacts')
      .select('name,email')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .eq('role', 'primary')
      .eq('active', true)
      .maybeSingle()
    recipientEmail = String(contact?.email ?? '').trim()
    recipientName = String(contact?.name ?? '').trim()
  }
  if (!emailPattern.test(recipientEmail)) return reply(422, { error: 'no_client_email' })

  const senderName = String(tenant.email_from_name ?? tenant.name ?? '')
    .replace(/["<>\r\n]/g, '')
    .trim()
  let encrypted: { nonce: string; ciphertext: string }
  try {
    encrypted = await encryptReportToken(token, operationId, deliveryKey)
  } catch {
    return reply(503, { error: 'not_configured' })
  }
  const row = {
    id: operationId,
    tenant_id: tenantId,
    report_version_id: reportVersionId,
    share_id: share.id,
    token_hash: tokenHash,
    token_ciphertext: encrypted.ciphertext,
    token_nonce: encrypted.nonce,
    recipient_email: recipientEmail,
    recipient_name: recipientName,
    company_name: String(snapshot.company?.name ?? tenant.name),
    sender_name: senderName,
    sender_address: fromAddress,
    reply_to: emailPattern.test(tenant.email ?? '') ? tenant.email : null,
    app_url: appUrl.origin,
    requested_by: caller.user.id,
  }
  const { error: insertError } = await admin
    .from('service_visit_report_email_deliveries')
    .insert(row)
  if (insertError) {
    if (insertError.code !== '23505') return reply(500, { error: 'queue_failed' })
    const { data: prior } = await admin
      .from('service_visit_report_email_deliveries')
      .select('tenant_id,report_version_id,share_id,token_hash,requested_by')
      .eq('id', operationId)
      .maybeSingle()
    if (
      !prior ||
      prior.tenant_id !== tenantId ||
      prior.report_version_id !== reportVersionId ||
      prior.share_id !== share.id ||
      prior.token_hash !== tokenHash ||
      prior.requested_by !== caller.user.id
    )
      return reply(409, { error: 'operation_conflict' })
  }

  try {
    await dispatchVisitReportEmail(admin, operationId)
  } catch {
    // The durable worker will retry a queued or expired-lease delivery.
  }
  const { data: delivery, error: statusError } = await admin
    .from('service_visit_report_email_deliveries')
    .select('id,status,recipient_email,attempts,last_error_code')
    .eq('id', operationId)
    .maybeSingle()
  if (statusError || !delivery) return reply(500, { error: 'status_unavailable' })
  return reply(delivery.status === 'sent' ? 200 : 202, {
    id: delivery.id,
    status: delivery.status,
    recipientEmail: delivery.recipient_email,
    attempts: delivery.attempts,
    errorCode: delivery.last_error_code,
  })
})
