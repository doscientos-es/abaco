import { z } from 'zod'

import type { AiConfig } from './provider-config.js'

// Leave headroom for provider overhead; this is not a hard monetary cap.
export const maxCountedInputTokens = 3000

export class AiProviderHttpError extends Error {
  constructor(
    readonly operation: 'countTokens' | 'generateContent',
    readonly status: number,
  ) {
    super('ai_provider_unavailable')
  }
}

/** Counts the exact SDK-produced input (including files) before allowing generation. */
export async function countInput(
  config: AiConfig,
  url: string,
  init: RequestInit | undefined,
  fetcher: typeof fetch,
) {
  const parsedUrl = new URL(url)
  const expectedOrigin =
    config.provider === 'google'
      ? 'https://generativelanguage.googleapis.com'
      : 'https://api.openai.com'
  const expectedPaths =
    config.provider === 'google'
      ? [
          `/v1beta/models/${config.model}:generateContent`,
          `/v1beta/models/${config.model}:streamGenerateContent`,
        ]
      : ['/v1/responses']
  if (
    parsedUrl.origin !== expectedOrigin ||
    !expectedPaths.includes(parsedUrl.pathname) ||
    typeof init?.body !== 'string'
  )
    throw new Error('ai_provider_unavailable')

  const generation = JSON.parse(init.body) as Record<string, unknown>
  const countUrl =
    config.provider === 'google'
      ? `${expectedOrigin}/v1beta/models/${config.model}:countTokens`
      : `${expectedOrigin}/v1/responses/input_tokens`
  const body =
    config.provider === 'google'
      ? { generateContentRequest: { ...generation, model: `models/${config.model}` } }
      : Object.fromEntries(
          ['model', 'input', 'instructions', 'text', 'tools', 'tool_choice']
            .filter((key) => generation[key] !== undefined)
            .map((key) => [key, generation[key]]),
        )
  const response = await fetcher(countUrl, { ...init, body: JSON.stringify(body) })
  if (!response.ok) throw new AiProviderHttpError('countTokens', response.status)
  const result = (await response.json().catch(() => null)) as unknown
  const schema =
    config.provider === 'google'
      ? z
          .object({ totalTokens: z.number().int().nonnegative() })
          .transform((value) => value.totalTokens)
      : z
          .object({ input_tokens: z.number().int().nonnegative() })
          .transform((value) => value.input_tokens)
  const count = schema.safeParse(result)
  if (!count.success) throw new Error('ai_provider_response_invalid')
  if (count.data > maxCountedInputTokens) throw new Error('ai_input_too_large')
}
