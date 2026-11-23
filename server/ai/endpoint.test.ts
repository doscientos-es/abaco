import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from '../../api/ai_suggestion'
import * as gemini from './gemini'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}))
vi.mock('./gemini', async (importOriginal) => ({
  ...(await importOriginal<typeof gemini>()),
  generateSuggestion: vi.fn(),
}))

const tenant = '00000000-0000-4000-8000-000000000001'
async function invoke() {
  const body = JSON.stringify({
    tenantId: tenant,
    request: { task: 'estimate', messages: [{ role: 'user', text: 'Pintar una habitación' }] },
  })
  const request = Object.assign(Readable.from([body]), {
    method: 'POST',
    headers: { origin: 'https://app.example', authorization: 'Bearer session' },
  }) as IncomingMessage
  let result = ''
  const response = {
    statusCode: 200,
    setHeader() {},
    end(value: string) {
      result = value
    },
  }
  await handler(request, response as unknown as ServerResponse)
  return { status: response.statusCode, body: JSON.parse(result) as unknown }
}

beforeEach(() => {
  vi.stubEnv('APP_ORIGIN', 'https://app.example')
  vi.stubEnv('SUPABASE_URL', 'https://example.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-test')
  vi.stubEnv('GEMINI_API_KEY', 'gemini-test')
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null })
  mocks.rpc.mockResolvedValue({ data: 'allowed', error: null })
  vi.mocked(gemini.generateSuggestion).mockResolvedValue({ message: 'Propuesta', lines: [] })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('AI endpoint integration', () => {
  it('passes the verified identity, tenant and task to the atomic reservation', async () => {
    expect(await invoke()).toMatchObject({
      status: 200,
      body: { suggestion: { message: 'Propuesta' } },
    })
    expect(mocks.getUser).toHaveBeenCalledWith('session')
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_ai_request', {
      p_tenant: tenant,
      p_user: 'verified-user',
      p_task: 'estimate',
    })
    expect(gemini.generateSuggestion).toHaveBeenCalledTimes(1)
  })

  it('does not call the model when the reservation function is unavailable', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'missing_function' } })
    expect(await invoke()).toMatchObject({ status: 503, body: { error: 'unavailable' } })
    expect(gemini.generateSuggestion).not.toHaveBeenCalled()
  })

  it('requires configuration before authenticating or calling the model', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    expect(await invoke()).toMatchObject({ status: 503, body: { error: 'not_configured' } })
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(gemini.generateSuggestion).not.toHaveBeenCalled()
  })
})
