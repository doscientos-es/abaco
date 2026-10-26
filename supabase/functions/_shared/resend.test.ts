import { afterEach, describe, expect, it, vi } from 'vitest'

import { sendEmail, type EmailSendError } from './resend'

afterEach(() => vi.unstubAllGlobals())

describe('Resend adapter', () => {
  it('sends a stable idempotency key and returns the provider message id', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (name: string) =>
          ({ RESEND_API_KEY: 'key', RESEND_FROM: 'Equipo <from@example.es>' })[name],
      },
    })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'message-1' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const id = await sendEmail({
      to: 'client@example.es',
      subject: 'Parte',
      html: '<p>Parte</p>',
      text: 'Parte',
      fromName: 'Empresa',
      fromAddress: 'from@example.es',
      idempotencyKey: 'visit-report/delivery-1',
    })
    expect(id).toBe('message-1')
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe('visit-report/delivery-1')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).from).toBe('Empresa <from@example.es>')
  })

  it('does not expose provider response content in errors', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (name: string) => ({ RESEND_API_KEY: 'key', RESEND_FROM: 'from@example.es' })[name],
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ name: 'validation_error', message: 'link-secret' }),
      }),
    )
    await expect(
      sendEmail({
        to: 'client@example.es',
        subject: 'Parte',
        html: 'link-secret',
        text: 'link-secret',
      }),
    ).rejects.toMatchObject({ status: 422, retryable: false } satisfies Partial<EmailSendError>)
  })

  it('retries only the concurrent idempotency conflict', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (name: string) => ({ RESEND_API_KEY: 'key', RESEND_FROM: 'from@example.es' })[name],
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ name: 'concurrent_idempotent_requests' }),
      }),
    )
    await expect(
      sendEmail({ to: 'client@example.es', subject: 'Parte', html: 'x', text: 'x' }),
    ).rejects.toMatchObject({ status: 409, retryable: true })
  })
})
