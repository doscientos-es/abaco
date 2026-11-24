import type { IncomingMessage, ServerResponse } from 'node:http'

import { z } from 'zod'

import { readJson, reply } from '../visit-report-pdf/http.js'
import { parseAiRequest, type AiRequest } from './request.js'
import { AiProviderHttpError } from './token-budget.js'

type Reservation = 'allowed' | 'forbidden' | 'limit'
type Dependencies = {
  origin: string
  authenticate: (token: string) => Promise<string | null>
  reserve: (tenantId: string, userId: string, task: AiRequest['task']) => Promise<Reservation>
  generate: (input: AiRequest) => Promise<unknown>
}

const envelope = z.object({ tenantId: z.string().uuid(), request: z.unknown() }).strict()

/** Identity is verified before reading documents; the database must atomically authorize and reserve. */
export function createAiHandler(dependencies: Dependencies) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST') return reply(response, 405, { error: 'method_not_allowed' })
    if (request.headers.origin !== dependencies.origin)
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

    let tenantId: string
    let input: AiRequest
    try {
      const parsed = envelope.parse(await readJson(request, 2_900_000))
      tenantId = parsed.tenantId
      input = parseAiRequest(parsed.request)
    } catch {
      return reply(response, 400, { error: 'invalid_input' })
    }
    let reservation: Reservation
    try {
      reservation = await dependencies.reserve(tenantId, userId, input.task)
    } catch {
      return reply(response, 503, { error: 'unavailable' })
    }
    if (reservation === 'forbidden') return reply(response, 403, { error: 'forbidden' })
    if (reservation === 'limit') return reply(response, 429, { error: 'limit_reached' })
    // Unknown values must never grant access, even if the backing RPC changes.
    if (reservation !== 'allowed') {
      return reply(response, 503, { error: 'unavailable' })
    }
    try {
      return reply(response, 200, { suggestion: await dependencies.generate(input) })
    } catch (error) {
      if (error instanceof Error && error.message === 'ai_input_too_large')
        return reply(response, 413, { error: 'input_too_large' })
      if (error instanceof AiProviderHttpError) {
        if (error.status === 402 || error.status === 429)
          return reply(response, 503, { error: 'provider_limit' })
      }
      return reply(response, 503, { error: 'unavailable' })
    }
  }
}
