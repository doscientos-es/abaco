import { describe, expect, it } from 'vitest'

import { decryptReportToken, encryptReportToken, visitReportEmail } from './visit-report-email'

const secret = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))

describe('visit report email', () => {
  it('encrypts bearer tokens with delivery binding and never stores plaintext', async () => {
    const token = 'a'.repeat(64)
    const encrypted = await encryptReportToken(token, 'delivery-1', secret)
    expect(encrypted.ciphertext).not.toContain(token)
    expect(
      await decryptReportToken(encrypted.ciphertext, encrypted.nonce, 'delivery-1', secret),
    ).toBe(token)
    await expect(
      decryptReportToken(encrypted.ciphertext, encrypted.nonce, 'delivery-2', secret),
    ).rejects.toThrow()
  })

  it('builds a stable accessible message and escapes untrusted names', () => {
    const content = visitReportEmail(
      {
        id: 'delivery-1',
        recipient_name: '<Cliente>',
        recipient_email: 'cliente@example.es',
        company_name: 'Empresa & hijos',
        sender_name: 'Empresa & hijos',
        sender_address: 'informes@example.es',
        reply_to: null,
        app_url: 'https://abaco.example.es',
      },
      'a'.repeat(64),
    )
    expect(content.html).toContain('lang="es" dir="ltr"')
    expect(content.html).toContain('&lt;Cliente&gt;')
    expect(content.html).not.toContain('<Cliente>')
    expect(content.text).toContain('https://abaco.example.es/i/')
    expect(content.idempotencyKey).toBe('visit-report/delivery-1')
    expect(content.tags).toEqual([{ name: 'category', value: 'visit_report' }])
  })
})
