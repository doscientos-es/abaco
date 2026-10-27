import { describe, expect, it } from 'vitest'

import { parseReportEmailProviderEvent, verifyResendWebhook } from './visit-report-email-events'

const bytes = new Uint8Array(32).fill(7)
const secret = `whsec_${btoa(String.fromCharCode(...bytes))}`
const now = Date.parse('2026-10-25T10:00:00Z')
const timestamp = String(Math.floor(now / 1000))
const body = JSON.stringify({
  type: 'email.delivered',
  created_at: '2026-10-25T09:59:59Z',
  data: {
    email_id: 'provider-email-id',
    to: ['Client@Example.test'],
    tags: { category: 'visit_report' },
  },
})

async function signedHeaders(raw: string, at = timestamp) {
  const key = await crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`msg_1.${at}.${raw}`)),
  )
  return new Headers({
    'svix-id': 'msg_1',
    'svix-timestamp': at,
    'svix-signature': `v1,${btoa(String.fromCharCode(...signature))}`,
  })
}

describe('Resend report events', () => {
  it('accepts the raw signed payload and rejects modifications or stale replay', async () => {
    const headers = await signedHeaders(body)
    expect(await verifyResendWebhook(body, headers, secret, now)).toBe(true)
    expect(await verifyResendWebhook(`${body} `, headers, secret, now)).toBe(false)
    expect(await verifyResendWebhook(body, headers, secret, now + 301_000)).toBe(false)
  })

  it('extracts only tracked operational metadata', () => {
    expect(parseReportEmailProviderEvent(body, 'msg_1')).toEqual({
      event_id: 'msg_1',
      provider_message_id: 'provider-email-id',
      recipient_email: 'client@example.test',
      event_type: 'email.delivered',
      occurred_at: '2026-10-25T09:59:59.000Z',
    })
    expect(parseReportEmailProviderEvent('null', 'msg_1')).toBeNull()
    expect(parseReportEmailProviderEvent('{"type":"email.received"}', 'msg_1')).toBeNull()
    expect(
      parseReportEmailProviderEvent(
        JSON.stringify({
          type: 'email.delivered',
          created_at: '2026-10-25T09:59:59Z',
          data: { email_id: 'another-email', to: ['other@example.test'] },
        }),
        'msg_2',
      ),
    ).toBeNull()
  })
})
