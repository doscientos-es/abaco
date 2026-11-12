import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import publicHandler from '../../api/visit_report_pdf'
import workerHandler from '../../api/visit_report_pdf_worker'
import { createOrGetPdf } from './public'
import { processOnePdfJob } from './worker'

vi.mock('./public', () => ({ createOrGetPdf: vi.fn() }))
vi.mock('./worker', () => ({ processOnePdfJob: vi.fn() }))

beforeEach(() => {
  vi.mocked(createOrGetPdf).mockResolvedValue('https://example.test/report.pdf')
  vi.mocked(processOnePdfJob).mockResolvedValue('ready')
})

async function invoke(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
  options: { method?: string; body?: string; authorization?: string } = {},
) {
  const body = options.body ?? ''
  const request = Object.assign(Readable.from([body]), {
    method: options.method ?? 'POST',
    headers: {
      'content-length': String(Buffer.byteLength(body)),
      authorization: options.authorization,
    },
  }) as IncomingMessage
  let result = ''
  const response = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value
    },
    end(value: string) {
      result = value
    },
  }
  await handler(request, response as unknown as ServerResponse)
  return {
    status: response.statusCode,
    headers: response.headers,
    body: JSON.parse(result) as Record<string, string>,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('Vercel report endpoints', () => {
  it('validates the public request and returns a no-store URL', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.test')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    expect((await invoke(publicHandler, { method: 'GET' })).status).toBe(405)
    expect((await invoke(publicHandler, { body: '{' })).status).toBe(400)
    expect(
      (await invoke(publicHandler, { body: JSON.stringify({ token: 'a'.repeat(300) }) })).status,
    ).toBe(400)
    expect(
      (await invoke(publicHandler, { body: JSON.stringify({ token: 'invalid' }) })).status,
    ).toBe(404)
    const result = await invoke(publicHandler, { body: JSON.stringify({ token: 'a'.repeat(64) }) })
    expect(result.status).toBe(200)
    expect(result.headers['Cache-Control']).toBe('no-store')
    expect(result.body.url).toBe('https://example.test/report.pdf')
  })

  it('requires the cron secret before executing the worker', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret')
    vi.stubEnv('SUPABASE_URL', 'https://example.test')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
    expect((await invoke(workerHandler, { authorization: 'Bearer incorrect' })).status).toBe(401)
    expect((await invoke(workerHandler, { authorization: 'Bearer test-secret' })).body.status).toBe(
      'ready',
    )
  })
})
