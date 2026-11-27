import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  pipeUIMessageStreamToResponse,
  toUIMessageStream,
  validateUIMessages,
  type UIMessage,
} from 'ai'
import { z } from 'zod'

import { maxChatRequestBytes } from '../../src/features/ai/domain/chat-attachment-limits.js'
import { readJson, reply } from '../visit-report-pdf/http.js'
import { validateChatAttachments } from './chat-attachments.js'
import { chatTools, type streamChat } from './chat-provider.js'

type Dependencies = {
  origin: string
  audioAllowed?: boolean
  authenticate: (token: string) => Promise<string | null>
  reserve: (tenantId: string, userId: string) => Promise<'allowed' | 'forbidden' | 'limit'>
  stream: (
    messages: UIMessage[],
    context: ChatContext,
    signal: AbortSignal,
  ) => ReturnType<typeof streamChat>
}

const contextSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().max(200),
    number: z.string().max(100),
    clientName: z.string().max(200).nullable(),
    lines: z
      .array(
        z
          .object({
            id: z.string().uuid().optional(),
            description: z.string().max(200),
            quantity: z.number().finite(),
            unit: z.string().max(100),
            unitPriceCents: z.number().finite(),
          })
          .strict(),
      )
      .max(10),
    moreLines: z.boolean(),
  })
  .strict()
  .nullable()
type ChatContext = z.infer<typeof contextSchema>
const envelope = z
  .object({
    tenantId: z.string().uuid(),
    messages: z.array(z.unknown()).min(1).max(20),
    context: contextSchema,
  })
  .strict()

export function createChatHandler(dependencies: Dependencies) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST' && request.method !== 'GET')
      return reply(response, 405, { error: 'method_not_allowed' })
    if (
      request.headers.origin !== dependencies.origin &&
      !(request.method === 'GET' && !request.headers.origin)
    )
      return reply(response, 403, { error: 'forbidden' })
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '')?.[1]
    if (!token || token.length > 8192) return reply(response, 401, { error: 'unauthorized' })
    let userId: string | null
    try {
      userId = await dependencies.authenticate(token)
    } catch {
      return reply(response, 503, { error: 'unavailable' })
    }
    if (!userId) return reply(response, 401, { error: 'unauthorized' })
    if (request.method === 'GET') {
      response.setHeader('Cache-Control', 'no-store')
      return reply(response, 200, { audioAllowed: dependencies.audioAllowed === true })
    }

    let tenantId: string
    let messages: UIMessage[]
    let context: ChatContext
    try {
      const parsed = envelope.parse(await readJson(request, maxChatRequestBytes))
      tenantId = parsed.tenantId
      context = parsed.context
      messages = await validateUIMessages({ messages: parsed.messages, tools: chatTools })
      if (
        messages[0]?.role !== 'user' ||
        messages.some(
          (message) =>
            message.role === 'system' ||
            (message.role === 'user' &&
              (!message.parts.some(
                (part) => (part.type === 'text' && part.text.trim()) || part.type === 'file',
              ) ||
                message.parts.some((part) => part.type === 'text' && part.text.length > 4000))) ||
            message.parts.some((part) =>
              message.role === 'user'
                ? part.type !== 'text' && part.type !== 'file'
                : ![
                    'text',
                    'step-start',
                    'tool-buscar',
                    'tool-proponer_cliente',
                    'tool-proponer_edicion_cliente',
                    'tool-proponer_stock',
                    'tool-proponer_materiales',
                    'tool-proponer_precios_catalogo',
                    'tool-proponer_edicion_partida',
                    'tool-proponer_partidas',
                    'tool-proponer_presupuesto',
                  ].includes(part.type),
            ),
        )
      )
        throw new Error('invalid message')
      await validateChatAttachments(messages, dependencies.audioAllowed === true)
    } catch {
      return reply(response, 400, { error: 'invalid_input' })
    }

    let reservation: 'allowed' | 'forbidden' | 'limit'
    try {
      reservation = await dependencies.reserve(tenantId, userId)
    } catch {
      return reply(response, 503, { error: 'unavailable' })
    }
    if (reservation === 'forbidden') return reply(response, 403, { error: 'forbidden' })
    if (reservation === 'limit') return reply(response, 429, { error: 'limit_reached' })
    if (reservation !== 'allowed') return reply(response, 503, { error: 'unavailable' })
    // The client may have disconnected while the reservation was in flight.
    if (response.destroyed) return
    const abort = new AbortController()
    const onClose = () => {
      if (!response.writableFinished) abort.abort()
    }
    response.on('close', onClose)
    try {
      const result = await dependencies.stream(messages, context, abort.signal)
      await pipeUIMessageStreamToResponse({
        response,
        headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
        stream: toUIMessageStream({
          stream: result.stream,
          onError: () => 'No se pudo completar la respuesta.',
        }),
      })
    } catch {
      if (!response.headersSent) return reply(response, 503, { error: 'unavailable' })
      response.end()
    } finally {
      response.off('close', onClose)
    }
  }
}
