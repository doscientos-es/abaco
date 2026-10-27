import { afterEach, describe, expect, it, vi } from 'vitest'

import { encryptReportToken } from './visit-report-email'
import { dispatchVisitReportEmail } from './visit-report-email-dispatch'

const secret = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)))
const token = 'a'.repeat(64)

async function fixture(revoked = false) {
  const encrypted = await encryptReportToken(token, 'delivery-1', secret)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  const delivery = {
    id: 'delivery-1',
    tenant_id: 'tenant-1',
    report_version_id: 'version-1',
    share_id: 'share-1',
    token_hash: hash,
    token_ciphertext: encrypted.ciphertext,
    token_nonce: encrypted.nonce,
    lease_token: 'lease-1',
    recipient_name: 'Cliente',
    recipient_email: 'cliente@example.es',
    company_name: 'Empresa',
    sender_name: 'Empresa',
    sender_address: 'from@example.es',
    reply_to: null,
    app_url: 'https://abaco.example.es',
  }
  const rpc = vi.fn(async (name: string) =>
    name === 'claim_service_visit_report_email_delivery'
      ? { data: [delivery], error: null }
      : { data: true, error: null },
  )
  const lookup = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: 'share-1',
        tenant_id: 'tenant-1',
        report_version_id: 'version-1',
        token_hash: hash,
        revoked_at: revoked ? new Date().toISOString() : null,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      error: null,
    }),
  }
  return { admin: { rpc, from: vi.fn().mockReturnValue(lookup) }, rpc }
}

afterEach(() => vi.unstubAllGlobals())

describe('visit report email dispatch', () => {
  it('sends a claimed delivery and records the provider id', async () => {
    const { admin, rpc } = await fixture()
    vi.stubGlobal('Deno', {
      env: {
        get: (name: string) =>
          ({ REPORT_DELIVERY_KEY: secret, RESEND_API_KEY: 'key', RESEND_FROM: 'from@example.es' })[
            name
          ],
      },
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: 'message-1' }) })
    vi.stubGlobal('fetch', fetchMock)
    expect(await dispatchVisitReportEmail(admin as never, 'delivery-1')).toBe(true)
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe('visit-report/delivery-1')
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_outcome: 'sent',
      p_provider_message_id: 'message-1',
    })
  })

  it('does not send after a share is revoked', async () => {
    const { admin, rpc } = await fixture(true)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await dispatchVisitReportEmail(admin as never, 'delivery-1')).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_outcome: 'failed',
      p_error_code: 'share_unavailable',
    })
  })

  it('keeps a provider outage in the retry queue', async () => {
    const { admin, rpc } = await fixture()
    vi.stubGlobal('Deno', {
      env: {
        get: (name: string) =>
          ({ REPORT_DELIVERY_KEY: secret, RESEND_API_KEY: 'key', RESEND_FROM: 'from@example.es' })[
            name
          ],
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ name: 'service_unavailable' }),
      }),
    )
    expect(await dispatchVisitReportEmail(admin as never, 'delivery-1')).toBe(true)
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_outcome: 'retry',
      p_error_code: 'provider_503',
    })
  })
})
