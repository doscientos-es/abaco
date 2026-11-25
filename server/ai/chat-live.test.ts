import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { describe, expect, it, vi } from 'vitest'

import { createChatHandler } from './chat-http'
import { streamChat } from './chat-provider'
import { aiConfig } from './provider-config'

// Opt-in only: invokes the configured provider and may incur provider charges.
describe.skipIf(process.env.AI_LIVE_TEST !== '1')('real AI streaming', () => {
  it('streams proposals, continues searches and cancels a real provider call', async () => {
    const config = aiConfig(process.env)
    expect(Boolean(config), 'AI provider is not configured').toBe(true)
    if (!config) return
    let reservations = 0
    let modelSignal: AbortSignal | undefined
    const handler = createChatHandler({
      origin: 'https://app.example',
      authenticate: async () => 'synthetic-user',
      reserve: async () => {
        reservations++
        return 'allowed'
      },
      stream: (messages, context, signal) => {
        modelSignal = signal
        return streamChat(messages, config, context, signal)
      },
    })
    const server = createServer((req, res) => void handler(req, res))
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const request = (messages: unknown[], signal = AbortSignal.timeout(45000)) =>
        fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
          method: 'POST',
          headers: {
            origin: 'https://app.example',
            authorization: 'Bearer synthetic',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            tenantId: '00000000-0000-4000-8000-000000000001',
            context: null,
            messages,
          }),
          signal,
        })
      const user = (text: string) => ({ id: 'user', role: 'user', parts: [{ type: 'text', text }] })
      const response = await request([
        user(
          'Prepara un nuevo cliente ficticio llamado Ejemplo Prueba, con correo ejemplo@example.test.',
        ),
      ])
      expect(response.status).toBe(200)
      const output = await response.text()
      expect(reservations).toBe(1)
      expect(output.includes('"type":"tool-input-start"'), 'missing streamed tool start').toBe(true)
      expect(output.includes('"type":"tool-input-delta"'), 'missing streamed tool arguments').toBe(
        true,
      )
      expect(output.includes('"type":"tool-input-available"'), 'missing complete tool input').toBe(
        true,
      )
      expect(output.includes('"toolName":"proponer_cliente"'), 'missing client proposal').toBe(true)

      const searchUser = user(
        'Busca al cliente ficticio Ejemplo Prueba y dime si existe. No crees ningún cliente.',
      )
      const searchResponse = await request([searchUser])
      expect(searchResponse.status).toBe(200)
      const searchOutput = await searchResponse.text()
      const events = searchOutput
        .split('\n')
        .filter((line) => line.startsWith('data: {'))
        .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)
      const search = events.find(
        (event) => event.type === 'tool-input-available' && event.toolName === 'buscar',
      )
      expect(Boolean(search), 'missing search tool call').toBe(true)
      if (!search) return
      const continuation = await request([
        searchUser,
        {
          id: 'assistant',
          role: 'assistant',
          parts: [
            {
              type: 'tool-buscar',
              toolCallId: search.toolCallId,
              state: 'output-available',
              input: search.input,
              output: {
                type: 'clientes',
                matches: [{ id: 'synthetic-client', name: 'Ejemplo Prueba' }],
              },
            },
          ],
        },
      ])
      expect(continuation.status).toBe(200)
      expect(
        (await continuation.text()).includes('"type":"text-delta"'),
        'missing streamed continuation',
      ).toBe(true)
      expect(reservations).toBe(3)

      const abort = new AbortController()
      const cancelled = await request(
        [user('Explica con detalle cómo preparar un presupuesto de pintura.')],
        abort.signal,
      )
      expect(cancelled.status).toBe(200)
      abort.abort()
      await vi.waitFor(() => expect(modelSignal?.aborted).toBe(true))
      expect(reservations).toBe(4)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }, 120000)
})
