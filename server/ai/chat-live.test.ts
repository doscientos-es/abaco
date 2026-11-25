import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { describe, expect, it } from 'vitest'

import { createChatHandler } from './chat-http'
import { streamChat } from './chat-provider'
import { aiConfig } from './provider-config'

// Opt-in only: invokes the configured provider and may incur provider charges.
describe.skipIf(process.env.AI_LIVE_TEST !== '1')('real AI streaming', () => {
  it('streams a synthetic client proposal through the HTTP handler', async () => {
    const config = aiConfig(process.env)
    expect(Boolean(config), 'AI provider is not configured').toBe(true)
    if (!config) return
    let reservations = 0
    const handler = createChatHandler({
      origin: 'https://app.example',
      authenticate: async () => 'synthetic-user',
      reserve: async () => {
        reservations++
        return 'allowed'
      },
      stream: (messages, context, signal) => streamChat(messages, config, context, signal),
    })
    const server = createServer((req, res) => void handler(req, res))
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
        method: 'POST',
        headers: {
          origin: 'https://app.example',
          authorization: 'Bearer synthetic',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tenantId: '00000000-0000-4000-8000-000000000001',
          context: null,
          messages: [
            {
              id: 'user',
              role: 'user',
              parts: [
                {
                  type: 'text',
                  text: 'Prepara un nuevo cliente ficticio llamado Ejemplo Prueba, con correo ejemplo@example.test.',
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(45000),
      })
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
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }, 60000)
})
