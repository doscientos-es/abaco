import type { UIMessage } from 'ai'
import { describe, expect, it } from 'vitest'

import { chatContextWindow } from './chat-context-window'

const user = (id: string): UIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text: 'Hola' }],
})
const proposal = (id: string, call: string, text = ''): UIMessage => ({
  id,
  role: 'assistant',
  parts: [
    ...(text ? [{ type: 'text' as const, text }] : []),
    {
      type: 'tool-proponer_cliente',
      toolCallId: call,
      state: 'output-available',
      input: {},
      output: {},
    },
  ],
})

describe('chat context window', () => {
  it('starts a fresh context after a completed action, retaining the next user message', () => {
    const messages = [user('old'), proposal('done', 'client'), user('new')]
    expect(chatContextWindow(messages, new Set(['client'])).map(({ id }) => id)).toEqual(['new'])
  })

  it('keeps pending proposals and questions even when another action is complete', () => {
    const pending = [user('old'), proposal('pending', 'one'), proposal('done', 'two'), user('new')]
    expect(chatContextWindow(pending, new Set(['two']))).toEqual(pending)
    const question = [user('old'), proposal('done', 'one', '¿Qué dirección tiene?'), user('answer')]
    expect(chatContextWindow(question, new Set(['one']))).toEqual(question)
  })

  it('does not drop a completed proposal before an automatic continuation', () => {
    const messages = [user('old'), proposal('done', 'one')]
    expect(chatContextWindow(messages, new Set(['one']))).toEqual(messages)
  })

  it('retains questions embedded in an estimate preview', () => {
    const messages: UIMessage[] = [
      user('old'),
      {
        id: 'a',
        role: 'assistant',
        parts: [
          {
            type: 'tool-proponer_partidas',
            toolCallId: 'p',
            state: 'output-available',
            input: { message: '¿Añadimos más?', lines: [] },
            output: {},
          },
        ],
      },
      user('answer'),
    ]
    expect(chatContextWindow(messages, new Set(['p']))).toEqual(messages)
  })

  it('keeps at most four recent user turns and starts with a user message', () => {
    const messages = Array.from({ length: 6 }, (_, i) => [
      user(`u${i}`),
      {
        id: `a${i}`,
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: 'Hecho.' }],
      },
    ]).flat()
    expect(chatContextWindow(messages, new Set()).map(({ id }) => id)).toEqual([
      'u2',
      'a2',
      'u3',
      'a3',
      'u4',
      'a4',
      'u5',
      'a5',
    ])
  })

  it('retains older pending proposals rather than cutting them at four turns', () => {
    const messages = [
      user('old'),
      proposal('pending', 'p'),
      ...Array.from({ length: 4 }, (_, i) => user(`u${i}`)),
    ]
    expect(chatContextWindow(messages, new Set())).toEqual(messages)
  })

  it('does not silently remove pending proposals beyond the hard message limit', () => {
    const messages = [
      user('old'),
      proposal('pending', 'p'),
      ...Array.from({ length: 20 }, (_, i) => user(`u${i}`)),
    ]
    expect(() => chatContextWindow(messages, new Set())).toThrow(
      'Resuelve las propuestas pendientes',
    )
  })

  it('does not discard a pending proposal when its user message falls outside the limit', () => {
    const messages = [
      user('old'),
      proposal('pending', 'p'),
      ...Array.from({ length: 19 }, (_, i) => user(`u${i}`)),
    ]
    expect(() => chatContextWindow(messages, new Set())).toThrow(
      'Resuelve las propuestas pendientes',
    )
  })
})
