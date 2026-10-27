/** Verify Resend's Svix signature before parsing any provider event. */
export async function verifyResendWebhook(
  rawBody: string,
  headers: Headers,
  secret: string,
  nowMs = Date.now(),
) {
  const id = headers.get('svix-id') ?? ''
  const timestamp = headers.get('svix-timestamp') ?? ''
  const signatures = headers.get('svix-signature') ?? ''
  if (
    !secret.startsWith('whsec_') ||
    !id ||
    id.length > 128 ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(nowMs - Number(timestamp) * 1000) > 300_000 ||
    signatures.length > 2048
  )
    return false
  try {
    const keyBytes = Uint8Array.from(atob(secret.slice(6)), (char) => char.charCodeAt(0))
    if (keyBytes.length < 16) return false
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const signed = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)
    for (const part of signatures.split(' ')) {
      if (!part.startsWith('v1,')) continue
      const value = Uint8Array.from(atob(part.slice(3)), (char) => char.charCodeAt(0))
      if (value.length === 32 && (await crypto.subtle.verify('HMAC', key, value, signed)))
        return true
    }
  } catch {
    return false
  }
  return false
}

const trackedEvents = new Set([
  'email.delivery_delayed',
  'email.delivered',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
])

export type ReportEmailProviderEvent = {
  event_id: string
  provider_message_id: string
  recipient_email: string
  event_type: string
  occurred_at: string
}

export function parseReportEmailProviderEvent(raw: string, eventId: string) {
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return null
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const event = body as Record<string, unknown>
  const data = event.data as Record<string, unknown> | null
  if (!data || !trackedEvents.has(String(event.type))) return null
  const tags = data.tags as Record<string, unknown> | null
  if (!tags || tags.category !== 'visit_report') return null
  const emailId = data.email_id
  const recipient = data.to
  const occurredAt = event.created_at
  if (
    typeof emailId !== 'string' ||
    emailId.length < 1 ||
    emailId.length > 128 ||
    !Array.isArray(recipient) ||
    recipient.length !== 1 ||
    typeof recipient[0] !== 'string' ||
    recipient[0].length < 3 ||
    recipient[0].length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient[0]) ||
    typeof occurredAt !== 'string' ||
    !Number.isFinite(Date.parse(occurredAt))
  )
    return null
  return {
    event_id: eventId,
    provider_message_id: emailId,
    recipient_email: recipient[0].trim().toLowerCase(),
    event_type: event.type as string,
    occurred_at: new Date(occurredAt).toISOString(),
  } satisfies ReportEmailProviderEvent
}
