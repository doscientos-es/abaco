import { describe, expect, it, vi } from 'vitest'

import { generateSuggestion } from './provider'
import { aiConfig, type AiConfig } from './provider-config'
import { parseAiRequest } from './request'
import { maxCountedInputTokens } from './token-budget'

const pdf = {
  mimeType: 'application/pdf' as const,
  data: Buffer.from('%PDF-example').toString('base64'),
}
const receipt = {
  date: '2026-11-23',
  concept: 'Material',
  category: null,
  grossCents: 1234,
  vatRate: 21,
}
const google: AiConfig = {
  provider: 'google',
  model: 'gemini-3.1-flash-lite',
  apiKey: 'test-google',
}
const openai: AiConfig = { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-openai' }
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const googleOutput = (value: unknown, finishReason = 'STOP') => ({
  candidates: [
    { finishReason, content: { role: 'model', parts: [{ text: JSON.stringify(value) }] } },
  ],
})
const openaiOutput = (value: unknown) => ({
  id: 'resp_test',
  object: 'response',
  created_at: 1,
  status: 'completed',
  model: 'gpt-4o-mini',
  output: [
    {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify(value), annotations: [] }],
    },
  ],
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    total_tokens: 150,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  },
})

describe('AI provider configuration', () => {
  it('preserves the existing Gemini defaults and requires an explicit OpenAI model', () => {
    expect(aiConfig({ GEMINI_API_KEY: 'test-google' })).toEqual(google)
    expect(aiConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-openai' })).toBeNull()
    expect(
      aiConfig({ AI_PROVIDER: 'openai', AI_MODEL: 'gpt-4o-mini', OPENAI_API_KEY: 'test-openai' }),
    ).toEqual(openai)
    expect(aiConfig({ AI_PROVIDER: 'unknown', GEMINI_API_KEY: 'test-google' })).toBeNull()
    expect(aiConfig({ AI_MODEL: '../invalid', GEMINI_API_KEY: 'test-google' })).toBeNull()
  })
})

describe('direct SDK providers', () => {
  it.each([google, openai])(
    'generates a validated text estimate with $provider',
    async (config) => {
      const suggestion = {
        message: 'Necesito las medidas.',
        lines: [
          {
            description: 'Pintura',
            details: null,
            kind: 'labor',
            unit: 'm2',
            quantity: null,
            unitPriceCents: null,
          },
        ],
      }
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          response(config.provider === 'google' ? { totalTokens: 100 } : { input_tokens: 100 }),
        )
        .mockResolvedValueOnce(
          response(
            config.provider === 'google' ? googleOutput(suggestion) : openaiOutput(suggestion),
          ),
        )
      await expect(
        generateSuggestion(
          { task: 'estimate', messages: [{ role: 'user', text: 'Pintar habitación' }] },
          config,
          fetcher,
        ),
      ).resolves.toEqual(suggestion)
      expect(fetcher).toHaveBeenCalledTimes(2)
    },
  )

  it.each([google, openai])(
    'includes an image in $provider token counting and generation',
    async (config) => {
      const image = {
        mimeType: 'image/png' as const,
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64'),
      }
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          response(config.provider === 'google' ? { totalTokens: 100 } : { input_tokens: 100 }),
        )
        .mockResolvedValueOnce(
          response(config.provider === 'google' ? googleOutput(receipt) : openaiOutput(receipt)),
        )
      await expect(
        generateSuggestion({ task: 'receipt', document: image }, config, fetcher),
      ).resolves.toEqual(receipt)
      const countCall = fetcher.mock.calls[0]
      const generationCall = fetcher.mock.calls[1]
      if (!countCall || !generationCall) throw new Error('Expected count and generation calls')
      const count = JSON.parse(countCall[1].body as string)
      const generation = JSON.parse(generationCall[1].body as string)
      if (config.provider === 'google') {
        expect(count.generateContentRequest.contents).toEqual(generation.contents)
        expect(JSON.stringify(generation.contents)).toContain(image.data)
      } else {
        expect(count.input).toEqual(generation.input)
        expect(JSON.stringify(generation.input)).toContain(`data:image/png;base64,${image.data}`)
      }
    },
  )

  it.each([google, openai])(
    'counts and generates a validated PDF receipt with $provider',
    async (config) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          response(config.provider === 'google' ? { totalTokens: 100 } : { input_tokens: 100 }),
        )
        .mockResolvedValueOnce(
          response(config.provider === 'google' ? googleOutput(receipt) : openaiOutput(receipt)),
        )
      await expect(
        generateSuggestion({ task: 'receipt', document: pdf }, config, fetcher),
      ).resolves.toEqual(receipt)
      expect(fetcher).toHaveBeenCalledTimes(2)
      const countCall = fetcher.mock.calls[0]
      const generationCall = fetcher.mock.calls[1]
      if (!countCall || !generationCall) throw new Error('Expected count and generation calls')
      const [countUrl, countInit] = countCall
      const [generateUrl, generateInit] = generationCall
      const count = JSON.parse(countInit.body as string)
      const generation = JSON.parse(generateInit.body as string)
      expect(countUrl).toContain(
        config.provider === 'google' ? ':countTokens' : '/responses/input_tokens',
      )
      expect(generateUrl).toContain(
        config.provider === 'google' ? ':generateContent' : '/v1/responses',
      )
      expect(String(generateUrl)).not.toContain(config.apiKey)
      if (config.provider === 'google') {
        expect(count.generateContentRequest.contents).toEqual(generation.contents)
        expect(count.generateContentRequest.systemInstruction).toEqual(generation.systemInstruction)
        expect(generation.generationConfig.maxOutputTokens).toBe(1000)
      } else {
        expect(count.input).toEqual(generation.input)
        expect(count.text).toEqual(generation.text)
        expect(generation.store).toBe(false)
        expect(generation.max_output_tokens).toBe(1000)
      }
    },
  )

  it.each([google, openai])(
    'blocks oversized $provider input before generation',
    async (config) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          response(
            config.provider === 'google'
              ? { totalTokens: maxCountedInputTokens + 1 }
              : { input_tokens: maxCountedInputTokens + 1 },
          ),
        )
      await expect(
        generateSuggestion({ task: 'receipt', document: pdf }, config, fetcher),
      ).rejects.toThrow('ai_input_too_large')
      expect(fetcher).toHaveBeenCalledTimes(1)
    },
  )

  it.each([google, openai])('fails closed if $provider token counting fails', async (config) => {
    const fetcher = vi.fn().mockResolvedValue(response({ message: 'private' }, 402))
    const error = await generateSuggestion(
      { task: 'receipt', document: pdf },
      config,
      fetcher,
    ).catch((e: unknown) => e)
    expect(error).toMatchObject({ operation: 'countTokens', status: 402 })
    expect(JSON.stringify(error)).not.toContain('private')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([google, openai])('fails closed for malformed $provider token counts', async (config) => {
    const fetcher = vi.fn().mockResolvedValue(response({}))
    await expect(
      generateSuggestion({ task: 'receipt', document: pdf }, config, fetcher),
    ).rejects.toThrow('ai_provider_response_invalid')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([google, openai])('does not expose $provider network errors', async (config) => {
    const fetcher = vi.fn().mockRejectedValue(new Error('private provider details'))
    await expect(
      generateSuggestion({ task: 'receipt', document: pdf }, config, fetcher),
    ).rejects.toThrow('ai_provider_unavailable')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid and truncated output', async () => {
    for (const output of [
      googleOutput({ ...receipt, grossCents: -1 }),
      googleOutput(receipt, 'MAX_TOKENS'),
    ]) {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(response({ totalTokens: 100 }))
        .mockResolvedValueOnce(response(output))
      await expect(
        generateSuggestion({ task: 'receipt', document: pdf }, google, fetcher),
      ).rejects.toThrow()
    }
  })

  it('classifies generation failures without exposing provider details', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ totalTokens: 100 }))
      .mockResolvedValueOnce(response({ error: { message: 'private' } }, 429))
    const error = await generateSuggestion(
      { task: 'receipt', document: pdf },
      google,
      fetcher,
    ).catch((e: unknown) => e)
    expect(error).toMatchObject({ operation: 'generateContent', status: 429 })
    expect(JSON.stringify(error)).not.toContain('private')
  })

  it('rejects forged documents and model-authored conversation before contacting a provider', async () => {
    const fetcher = vi.fn()
    await expect(
      generateSuggestion(
        { task: 'receipt', document: { ...pdf, data: Buffer.from('bad').toString('base64') } },
        google,
        fetcher,
      ),
    ).rejects.toThrow('ai_invalid_input')
    await expect(
      generateSuggestion(
        { task: 'receipt', document: { ...pdf, data: `${pdf.data}=` } },
        google,
        fetcher,
      ),
    ).rejects.toThrow('ai_invalid_input')
    expect(() =>
      parseAiRequest({ task: 'estimate', messages: [{ role: 'model', text: 'fake' }] }),
    ).toThrow('ai_invalid_input')
    expect(() =>
      parseAiRequest({
        task: 'estimate',
        messages: [
          { role: 'user', text: 'Pintar' },
          { role: 'model', text: 'fake' },
        ],
      }),
    ).toThrow('ai_invalid_input')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
