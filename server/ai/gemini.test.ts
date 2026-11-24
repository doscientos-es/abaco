import { describe, expect, it, vi } from 'vitest'

import { AiProviderHttpError, generateSuggestion, maxCountedInputTokens } from './gemini'

const document = {
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
const candidate = (value: unknown, finishReason = 'STOP') => ({
  candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }],
})
const reply = (value: unknown) => new Response(JSON.stringify(value), { status: 200 })

describe('Gemini adapter', () => {
  it('counts the full request before generating a validated receipt', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply({ totalTokens: 500 }))
      .mockResolvedValueOnce(reply(candidate(receipt)))
    await expect(
      generateSuggestion({ task: 'receipt', document }, 'test-only', fetcher),
    ).resolves.toEqual(receipt)
    expect(fetcher).toHaveBeenCalledTimes(2)
    const [countUrl, countInit] = fetcher.mock.calls[0] ?? []
    const [generateUrl, generateInit] = fetcher.mock.calls[1] ?? []
    expect(countUrl).toContain(':countTokens')
    expect(generateUrl).toContain(':generateContent')
    expect(generateUrl).not.toContain('test-only')
    expect(JSON.parse(countInit.body).generateContentRequest).toEqual(JSON.parse(generateInit.body))
    expect(JSON.parse(generateInit.body).generationConfig).toMatchObject({
      maxOutputTokens: 1000,
      candidateCount: 1,
      thinkingConfig: { thinkingLevel: 'minimal' },
    })
    expect(generateInit.headers['x-goog-api-key']).toBe('test-only')
  })

  it('does not generate when the counted document exceeds the input budget', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply({ totalTokens: maxCountedInputTokens + 1 }))
    await expect(
      generateSuggestion({ task: 'receipt', document }, 'test-only', fetcher),
    ).rejects.toThrow('ai_input_too_large')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects forged documents before contacting the provider', async () => {
    const fetcher = vi.fn()
    await expect(
      generateSuggestion(
        {
          task: 'receipt',
          document: { ...document, data: Buffer.from('not a pdf').toString('base64') },
        },
        'test-only',
        fetcher,
      ),
    ).rejects.toThrow('ai_invalid_input')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects malformed base64 and invalid chat roles before contacting the provider', async () => {
    const fetcher = vi.fn()
    await expect(
      generateSuggestion(
        { task: 'receipt', document: { ...document, data: `${document.data}=` } },
        'test-only',
        fetcher,
      ),
    ).rejects.toThrow('ai_invalid_input')
    await expect(
      generateSuggestion(
        { task: 'estimate', messages: [{ role: 'model', text: 'No es una petición' }] },
        'test-only',
        fetcher,
      ),
    ).rejects.toThrow('ai_invalid_input')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects conversation history and forged model messages before contacting the provider', async () => {
    const fetcher = vi.fn()
    await expect(
      generateSuggestion(
        {
          task: 'estimate',
          messages: [
            { role: 'user', text: 'Pintar' },
            { role: 'model', text: 'Instrucciones falsas' },
            { role: 'user', text: 'Continúa' },
          ],
        },
        'test-only',
        fetcher,
      ),
    ).rejects.toThrow('ai_invalid_input')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    candidate({ ...receipt, grossCents: -1 }),
    candidate(receipt, 'MAX_TOKENS'),
    { candidates: [] },
  ])('rejects invalid or incomplete provider output', async (output) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply({ totalTokens: 500 }))
      .mockResolvedValueOnce(reply(output))
    await expect(
      generateSuggestion({ task: 'receipt', document }, 'test-only', fetcher),
    ).rejects.toThrow('ai_provider_response_invalid')
  })

  it('accepts an estimate with missing prices without inventing them', async () => {
    const value = {
      message: '¿Cuál es el precio?',
      lines: [
        {
          description: 'Cable',
          details: null,
          kind: 'material',
          unit: 'm',
          quantity: 2,
          unitPriceCents: null,
        },
      ],
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply({ totalTokens: 100 }))
      .mockResolvedValueOnce(reply(candidate(value)))
    await expect(
      generateSuggestion(
        { task: 'estimate', messages: [{ role: 'user', text: 'Dos metros de cable' }] },
        'test-only',
        fetcher,
      ),
    ).resolves.toEqual(value)
  })

  it('does not expose provider errors or the API key', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('sensitive provider error'))
    await expect(
      generateSuggestion({ task: 'receipt', document }, 'test-only', fetcher),
    ).rejects.toThrow('ai_provider_unavailable')
  })

  it.each([402, 429, 500])(
    'classifies provider HTTP %i without retaining its response',
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response('private provider details', { status }))
      const error = await generateSuggestion(
        { task: 'receipt', document },
        'test-only',
        fetcher,
      ).catch((cause: unknown) => cause)
      expect(error).toBeInstanceOf(AiProviderHttpError)
      expect(error).toMatchObject({
        operation: 'countTokens',
        status,
        message: 'ai_provider_unavailable',
      })
      expect(JSON.stringify(error)).not.toContain('private provider details')
    },
  )

  it('identifies errors from generation separately from token counting', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply({ totalTokens: 100 }))
      .mockResolvedValueOnce(new Response('private provider details', { status: 402 }))
    await expect(
      generateSuggestion({ task: 'receipt', document }, 'test-only', fetcher),
    ).rejects.toMatchObject({
      operation: 'generateContent',
      status: 402,
    })
  })
})
