import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import { createAiHandler } from './http'

const tenantId = '00000000-0000-4000-8000-000000000001'
const requestBody = {
  tenantId,
  request: { task: 'estimate', messages: [{ role: 'user', text: 'Presupuesto de pintura' }] },
}

function setup() {
  const authenticate = vi.fn(async (_token: string) => 'user-id' as string | null)
  const reserve = vi.fn(
    async (_tenant: string, _user: string, _task: string) =>
      'allowed' as 'allowed' | 'forbidden' | 'limit',
  )
  const generate = vi.fn(async (_input: unknown): Promise<unknown> => ({
    message: 'ok',
    lines: [],
  }))
  const handler = createAiHandler({
    origin: 'https://app.example',
    authenticate,
    reserve,
    generate,
  })
  return { authenticate, reserve, generate, handler }
}

async function invoke(
  handler: ReturnType<typeof createAiHandler>,
  options: { body?: string; method?: string; origin?: string; authorization?: string } = {},
) {
  const body = options.body ?? JSON.stringify(requestBody)
  const request = Object.assign(Readable.from([body]), {
    method: options.method ?? 'POST',
    headers: {
      origin: options.origin ?? 'https://app.example',
      authorization: options.authorization ?? 'Bearer token',
      'content-length': String(Buffer.byteLength(body)),
    },
  }) as IncomingMessage
  let text = ''
  const response = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value
    },
    end(value: string) {
      text = value
    },
  }
  await handler(request, response as unknown as ServerResponse)
  return {
    status: response.statusCode,
    headers: response.headers,
    body: JSON.parse(text) as unknown,
  }
}

describe('AI HTTP boundary', () => {
  it('authenticates and reserves the correct user and task before calling the model', async () => {
    const { handler, authenticate, reserve, generate } = setup()
    const result = await invoke(handler)
    expect(result.status).toBe(200)
    expect(result.headers['Cache-Control']).toBe('no-store')
    expect(authenticate).toHaveBeenCalledWith('token')
    expect(reserve).toHaveBeenCalledWith(tenantId, 'user-id', 'estimate')
    expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(
      generate.mock.invocationCallOrder[0] ?? 0,
    )
    expect(generate).toHaveBeenCalledWith(requestBody.request)
  })

  it('blocks wrong origins, absent authentication, and unverified users before reserving', async () => {
    const { handler, authenticate, reserve, generate } = setup()
    expect((await invoke(handler, { origin: 'https://attacker.example' })).status).toBe(403)
    expect((await invoke(handler, { authorization: 'Basic token' })).status).toBe(401)
    authenticate.mockResolvedValueOnce(null)
    expect((await invoke(handler)).status).toBe(401)
    expect(reserve).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
  })

  it('rejects malformed input and forged documents before reserving', async () => {
    const { handler, reserve, generate } = setup()
    const invalid = {
      tenantId,
      request: { task: 'receipt', document: { mimeType: 'application/pdf', data: 'YWJj' } },
    }
    expect((await invoke(handler, { body: JSON.stringify(invalid) })).status).toBe(400)
    expect((await invoke(handler, { body: '{' })).status).toBe(400)
    expect(reserve).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
  })

  it('fails closed for denied, exhausted, and unavailable reservations', async () => {
    const { handler, reserve, generate } = setup()
    reserve
      .mockResolvedValueOnce('forbidden')
      .mockResolvedValueOnce('limit')
      .mockRejectedValueOnce(new Error('sensitive'))
    expect((await invoke(handler)).status).toBe(403)
    expect((await invoke(handler)).status).toBe(429)
    expect(await invoke(handler)).toMatchObject({ status: 503, body: { error: 'unavailable' } })
    expect(generate).not.toHaveBeenCalled()
  })

  it('does not return provider errors and reports oversized model input', async () => {
    const { handler, generate } = setup()
    generate
      .mockRejectedValueOnce(new Error('private details'))
      .mockRejectedValueOnce(new Error('ai_input_too_large'))
    expect(await invoke(handler)).toMatchObject({ status: 503, body: { error: 'unavailable' } })
    expect(await invoke(handler)).toMatchObject({ status: 413, body: { error: 'input_too_large' } })
  })
})
