import { afterEach, expect, it, vi } from 'vitest'

import { streamChat } from './chat-provider'

afterEach(() => vi.unstubAllGlobals())

it('counts the real Gemini streaming request before forwarding streamed text', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ totalTokens: 100 }), {
        headers: { 'content-type': 'application/json' },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Hola"}]},"finishReason":"STOP"}]}\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    )
  vi.stubGlobal('fetch', fetcher)
  const result = await streamChat(
    [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hola' }] }],
    { provider: 'google', model: 'gemini-3.1-flash-lite', apiKey: 'test' },
    null,
    new AbortController().signal,
  )
  const events = []
  for await (const event of result.stream) events.push(event)
  expect(events).toContainEqual(expect.objectContaining({ type: 'text-delta', text: 'Hola' }))
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(String(fetcher.mock.calls[0]?.[0])).toContain(':countTokens')
  expect(String(fetcher.mock.calls[1]?.[0])).toContain(':streamGenerateContent')
})

it('streams a search tool call with validated arguments', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ totalTokens: 100 }), {
        headers: { 'content-type': 'application/json' },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        'data: {"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"buscar","args":{"type":"clientes","query":"Marta"}}}]},"finishReason":"STOP"}]}\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    )
  vi.stubGlobal('fetch', fetcher)
  const result = await streamChat(
    [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Busca a Marta' }] }],
    { provider: 'google', model: 'gemini-3.1-flash-lite', apiKey: 'test' },
    null,
    new AbortController().signal,
  )
  const events = []
  for await (const event of result.stream) events.push(event)
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'tool-call',
      toolName: 'buscar',
      input: { type: 'clientes', query: 'Marta' },
    }),
  )
})
