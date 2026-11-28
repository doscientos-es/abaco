import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from '../api/customer_portal'

const token = 'a'.repeat(64)
const mock = vi.fn<typeof fetch>()
const valid = { expiresAt: '2099-03-06T10:00:00.000Z', visits: [], documents: [] }
const payload = JSON.stringify({ token })

async function request(body = payload, method = 'POST', headers: Record<string, string> = {}) {
  const stream = Object.assign(Readable.from([body]), {
    method,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
      ...headers,
    },
  }) as IncomingMessage
  let output = ''
  const responseHeaders = new Map<string, string>()
  const response = {
    statusCode: 0,
    setHeader(name: string, value: string) {
      responseHeaders.set(name, value)
    },
    end(value: string) {
      output = value
    },
  }
  await handler(stream, response as unknown as ServerResponse)
  return {
    status: response.statusCode,
    value: JSON.parse(output) as unknown,
    headers: responseHeaders,
  }
}

beforeEach(() => {
  mock.mockReset()
  vi.stubGlobal('fetch', mock)
  vi.stubEnv('SUPABASE_URL', 'https://db.example.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-secret')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('isolated customer portal API', () => {
  it('handles only POST; blocks malformed, oversized or cross-site input without DB access', async () => {
    expect((await request(payload, 'GET')).status).toBe(405)
    for (const body of [
      '{',
      '{"token":"short"}',
      JSON.stringify({ token, extra: 'b'.repeat(100) }),
    ]) {
      expect((await request(body)).value).toEqual({ error: 'not_found' })
    }
    expect((await request(payload, 'POST', { 'sec-fetch-site': 'cross-site' })).status).toBe(404)
    expect((await request(payload, 'POST', { 'content-type': 'text/plain' })).status).toBe(404)
    expect(mock).not.toHaveBeenCalled()
  })

  it('sends only the digest to auth-protected RPC and returns only bounded safe fields', async () => {
    mock.mockResolvedValue(
      Response.json({
        ...valid,
        tenantId: 'private',
        visits: [
          {
            startsAt: '2099-03-06T10:00:00Z',
            endsAt: '2099-03-06T11:00:00Z',
            timezone: 'Europe/Madrid',
            status: 'scheduled',
            notes: 'private note',
          },
        ],
        documents: [
          {
            closedAt: '2099-02-06T10:00:00Z',
            version: 3,
            checksTotal: 4,
            checksDone: 3,
            path: 'private path',
          },
        ],
      }),
    )
    const result = await request()
    expect(result.status).toBe(200)
    expect(result.headers.get('Cache-Control')).toBe('no-store')
    expect(result.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(result.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive')
    expect(JSON.stringify(result.value)).not.toMatch(/private|fixture|tenant|notes/)
    const [url, init] = mock.mock.calls[0] ?? []
    expect(url instanceof URL && url.href).toBe(
      'https://db.example.test/rest/v1/rpc/read_client_portal_grant',
    )
    expect(init).toMatchObject({
      body: JSON.stringify({ p_token_hash: createHash('sha256').update(token).digest('hex') }),
      cache: 'no-store',
      method: 'POST',
      redirect: 'manual',
    })
    expect(init?.body).not.toContain(token)
  })

  it('responds the same for revoked, unknown and expired grants', async () => {
    mock.mockResolvedValueOnce(Response.json(null))
    mock.mockResolvedValueOnce(Response.json({ ...valid, expiresAt: '2000-12-20T00:00:00Z' }))
    const [unknown, expired] = [await request(), await request()]
    expect(unknown.status).toBe(404)
    expect(expired.value).toEqual(unknown.value)
  })

  it('fails safely for unexpected projection/status or upstream deployment errors', async () => {
    mock.mockResolvedValueOnce(Response.json({ ...valid, visits: [{}] }))
    expect((await request()).value).toEqual({ error: 'unavailable' })
    mock.mockResolvedValueOnce(Response.json({ message: 'very internal message' }, { status: 403 }))
    expect((await request()).value).toEqual({ error: 'unavailable' })
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect((await request()).status).toBe(503)
  })
})
