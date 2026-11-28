import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

import { handleInterventionRequest, sanitizeIntakePhoto } from './http.js'

const origin = 'https://app.example.test'
const token = 'a'.repeat(64)
const operation = '77000000-0000-4000-8000-000000000001'
const purpose = {
  address: 'Calle de prueba 9',
  availability: 'Martes por la mañana',
  confirm: true,
  photos: [],
}
const receipt = '77000000-0000-4000-8000-000000000002'
const headers = {
  origin,
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  'x-request-invitation': token,
  'x-request-operation': operation,
}

function request(
  path: 'check' | 'submit',
  body: unknown = purpose,
  overrides: Record<string, string> = {},
) {
  return new Request(`${origin}/api/intervention-request/${path}`, {
    method: 'POST',
    headers: { ...headers, ...overrides },
    body: JSON.stringify(body),
  })
}

const options = {
  appOrigin: origin,
  allowRequest: async () => true,
  rpc: vi.fn<(name: string, params: Record<string, unknown>) => Promise<unknown>>(),
  images: undefined,
}

describe('DEV-83 same-origin bounded request', () => {
  it('checks origin and capability shape before a database call; preview has no private context', async () => {
    const rpc = vi.fn().mockResolvedValue({ state: 'pending', discarded: 'Private premise' })
    const opts = { ...options, rpc }
    expect(
      (
        await handleInterventionRequest(
          request('check', {}, { origin: 'https://elsewhere.test' }),
          opts,
        )
      ).status,
    ).toBe(403)
    expect(
      (await handleInterventionRequest(request('check', {}, { 'x-request-invitation': 'x' }), opts))
        .status,
    ).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
    const checked = await handleInterventionRequest(request('check', {}), opts)
    expect(await checked.json()).toEqual({ available: true })
    expect(checked.headers.get('cache-control')).toMatch(/no-store/)
    expect(rpc.mock.calls[0]?.[1]).not.toMatchObject({ p_token_hash: token })
  })

  it('fails closed before fetching an invite when the perimeter rate limit is absent or reached', async () => {
    const rpc = vi.fn()
    expect(
      (
        await handleInterventionRequest(request('check', {}), {
          ...options,
          allowRequest: async () => false,
          rpc,
        })
      ).status,
    ).toBe(429)
    expect(
      (
        await handleInterventionRequest(request('check', {}), {
          appOrigin: origin,
          images: undefined,
          rpc,
        })
      ).status,
    ).toBe(503)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('accepts no-file after clear confirmation and does not transmit the capability or unapproved fields', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ state: 'pending' }).mockResolvedValueOnce(receipt)
    expect(
      (
        await handleInterventionRequest(request('submit', { ...purpose, confirm: false }), {
          ...options,
          rpc,
        })
      ).status,
    ).toBe(400)
    expect(rpc).toHaveBeenCalledTimes(1)
    rpc
      .mockClear()
      .mockReset()
      .mockResolvedValueOnce({ state: 'pending' })
      .mockResolvedValueOnce(receipt)
    const submitted = await handleInterventionRequest(request('submit'), { ...options, rpc })
    expect(await submitted.json()).toEqual({ receipt })
    expect(rpc.mock.calls[1]).toEqual([
      'submit_intervention_intake',
      {
        p_token_hash: expect.not.stringMatching(token),
        p_op: operation,
        p_digest: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_address: purpose.address,
        p_availability: purpose.availability,
        p_photos: [],
      },
    ])
  })

  it('caps a streamed body with no Content-Length and skips all expensive work when token is invalid', async () => {
    const rpc = vi.fn().mockResolvedValue({ state: 'pending' })
    let pulls = 0
    const stream = new ReadableStream({
      pull(controller) {
        pulls++
        if (pulls === 12) controller.close()
        else controller.enqueue(new Uint8Array(1_000_000))
      },
    })
    const streaming = new Request(`${origin}/api/intervention-request/submit`, {
      method: 'POST',
      headers,
      body: stream,
      duplex: 'half',
    } as RequestInit)
    const response = await handleInterventionRequest(streaming, { ...options, rpc })
    expect(response.status).toBe(413)
    expect(pulls).toBeLessThan(12)
    expect(rpc).toHaveBeenCalledTimes(1)
    rpc.mockResolvedValue(null)
    expect(
      (
        await handleInterventionRequest(request('submit', { photos: 'not parsed' }), {
          ...options,
          rpc,
        })
      ).status,
    ).toBe(404)
  })

  it('returns same receipt for an exact transport replay and rejects a modified payload', async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ address: purpose.address, availability: purpose.availability, photos: [] }),
    )
    const digest = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex')
    const rpc = vi.fn().mockResolvedValue({ state: 'replay', receipt, digest })
    expect(
      await (await handleInterventionRequest(request('submit'), { ...options, rpc })).json(),
    ).toEqual({ receipt })
    const altered = await handleInterventionRequest(
      request('submit', { ...purpose, availability: 'Otro día' }),
      { ...options, rpc },
    )
    expect(altered.status).toBe(404)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('never sends an uploaded original to persistence, even if the decoder returns JPEG metadata', async () => {
    const original = await sharp({
      create: { width: 12, height: 12, channels: 3, background: '#173326' },
    })
      .withExif({ IFD0: { Copyright: 'fictitious metadata input DEV-83' } })
      .jpeg()
      .toBuffer()
    expect(
      Buffer.from((await sharp(original).metadata()).exif ?? []).includes('fictitious metadata'),
    ).toBe(true)
    const images = {
      async info(input: ReadableStream<Uint8Array>) {
        return sharp(Buffer.from(await new Response(input).arrayBuffer())).metadata()
      },
      input(input: ReadableStream<Uint8Array>) {
        return {
          transform: () => ({
            async output() {
              const normalized = await sharp(Buffer.from(await new Response(input).arrayBuffer()))
                .resize(8)
                .withExif({ IFD0: { Copyright: 'would leak if not stripped' } })
                .jpeg()
                .toBuffer()
              return {
                response: () =>
                  new Response(new Uint8Array(normalized), {
                    headers: { 'content-type': 'image/jpeg' },
                  }),
              }
            },
          }),
        }
      },
    }
    const sanitized = Buffer.from(
      await sanitizeIntakePhoto(original.toString('base64'), images),
      'base64',
    )
    const info = await sharp(sanitized).metadata()
    expect(info.width).toBe(8)
    expect(info.exif).toBeUndefined()
    expect(info.icc).toBeUndefined()
    expect(sanitized.includes('would leak if')).toBe(false)
    expect(sanitized.equals(original)).toBe(false)
    await expect(
      sanitizeIntakePhoto(Buffer.from('<svg></svg>').toString('base64'), images),
    ).rejects.toMatchObject({ status: 422 })
    const rpc = vi.fn().mockResolvedValue({ state: 'pending' })
    const unsupported = await handleInterventionRequest(
      request('submit', {
        ...purpose,
        photos: [original.toString('base64')],
      }),
      { ...options, rpc },
    )
    expect(unsupported.status).toBe(503)
    expect(await unsupported.json()).toEqual({ error: 'photo_unavailable' })
    expect(rpc).toHaveBeenCalledTimes(1)
    await expect(sanitizeIntakePhoto(original.toString('base64'), undefined)).rejects.toMatchObject(
      { status: 503 },
    )
  })
})
