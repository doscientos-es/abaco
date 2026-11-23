import { afterEach, describe, expect, it, vi } from 'vitest'

import { aiDocument, requestSuggestion } from './ai-api'

const getSession = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ auth: { getSession } }),
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AI client', () => {
  it('sends a verified suggestion request with the current session and validates the response', async () => {
    getSession.mockResolvedValueOnce({
      data: { session: { access_token: 'session-test' } },
      error: null,
    })
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          suggestion: {
            date: null,
            concept: 'Material',
            category: null,
            grossCents: 1000,
            vatRate: 21,
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetcher)
    const request = {
      task: 'receipt' as const,
      document: { mimeType: 'application/pdf' as const, data: 'JVBERi0=' },
    }
    await expect(requestSuggestion('tenant', request)).resolves.toMatchObject({
      concept: 'Material',
    })
    expect(fetcher).toHaveBeenCalledWith(
      '/api/ai_suggestion',
      expect.objectContaining({
        body: JSON.stringify({ tenantId: 'tenant', request }),
        headers: expect.objectContaining({ Authorization: 'Bearer session-test' }),
      }),
    )
  })

  it('blocks invalid documents before reading them and reports server limits', async () => {
    const read = vi.fn()
    const file = { type: 'application/pdf', size: 2_000_001, arrayBuffer: read } as unknown as File
    await expect(aiDocument(file)).rejects.toThrow('2 MB')
    expect(read).not.toHaveBeenCalled()
    getSession.mockResolvedValueOnce({
      data: { session: { access_token: 'session-test' } },
      error: null,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })))
    await expect(
      requestSuggestion('tenant', { task: 'estimate', messages: [{ role: 'user', text: 'hola' }] }),
    ).rejects.toThrow('límite de uso')
  })

  it('never accepts malformed provider data or sends requests without a session', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ suggestion: { lines: 'invalid' } })))
    vi.stubGlobal('fetch', fetcher)
    getSession.mockResolvedValueOnce({ data: { session: null }, error: null })
    await expect(
      requestSuggestion('tenant', { task: 'estimate', messages: [{ role: 'user', text: 'hola' }] }),
    ).rejects.toThrow('sesión')
    expect(fetcher).not.toHaveBeenCalled()
    getSession.mockResolvedValueOnce({
      data: { session: { access_token: 'session-test' } },
      error: null,
    })
    await expect(
      requestSuggestion('tenant', { task: 'estimate', messages: [{ role: 'user', text: 'hola' }] }),
    ).rejects.toThrow('interpretar')
  })
})
