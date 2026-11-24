import { z } from 'zod'

import type { AiDocument, AiRequest } from '../../src/features/ai/domain/requests'

export type { AiRequest } from '../../src/features/ai/domain/requests'

const documentInput = z
  .object({
    mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
    data: z.string().max(2_800_000),
  })
  .strict()
const requestInput = z.discriminatedUnion('task', [
  z.object({ task: z.literal('receipt'), document: documentInput }).strict(),
  z
    .object({
      task: z.literal('estimate'),
      messages: z.array(z.object({ role: z.enum(['user', 'model']), text: z.string() }).strict()),
      document: documentInput.optional(),
    })
    .strict(),
])

/** Validate before reserving a paid request, without contacting the provider. */
export function parseAiRequest(input: unknown): AiRequest {
  const parsed = requestInput.safeParse(input)
  if (!parsed.success) throw new Error('ai_invalid_input')
  const request = parsed.data
  if (
    request.task === 'estimate' &&
    (request.messages.length !== 1 ||
      request.messages[0]?.role !== 'user' ||
      !request.messages[0].text.trim() ||
      request.messages[0].text.length > 4000)
  )
    throw new Error('ai_invalid_input')
  if (request.document) validateDocument(request.document)
  if (request.task === 'estimate')
    return {
      task: request.task,
      messages: request.messages,
      ...(request.document ? { document: request.document } : {}),
    }
  return request
}

function validateDocument(document: AiDocument) {
  const signatures: Record<AiDocument['mimeType'], (bytes: Buffer) => boolean> = {
    'application/pdf': (bytes) => bytes.subarray(0, 5).toString('ascii') === '%PDF-',
    'image/jpeg': (bytes) => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
    'image/png': (bytes) =>
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/webp': (bytes) =>
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP',
  }
  if (
    !Object.hasOwn(signatures, document.mimeType) ||
    document.data.length > 2_800_000 ||
    document.data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(document.data)
  )
    throw new Error('ai_invalid_input')
  const bytes = Buffer.from(document.data, 'base64')
  if (
    bytes.length > 2_000_000 ||
    bytes.toString('base64') !== document.data ||
    !signatures[document.mimeType](bytes)
  )
    throw new Error('ai_invalid_input')
}
