import type { UIMessage } from 'ai'

import { estimateDraftProposalSchema, estimateProposalSchema } from '../domain/chat-tools'

export const pendingContextLimitMessage =
  'Resuelve las propuestas pendientes o limpia el chat antes de continuar.'

/** Keep pending actions and questions; only retire a turn after a confirmed action. */
export function chatContextWindow(
  messages: UIMessage[],
  completed: ReadonlySet<string>,
): UIMessage[] {
  const pending = new Set<string>()
  let lastCompletedTurn = -1
  let turnHasQuestion = false
  for (const [index, message] of messages.entries()) {
    if (message.role === 'user') {
      turnHasQuestion = false
      continue
    }
    if (message.role !== 'assistant') continue
    let completedHere = false
    for (const part of message.parts) {
      if (part.type === 'text' && /[?¿]/.test(part.text)) turnHasQuestion = true
      if (
        part.type !== 'tool-proponer_cliente' &&
        part.type !== 'tool-proponer_edicion_cliente' &&
        part.type !== 'tool-proponer_stock' &&
        part.type !== 'tool-proponer_materiales' &&
        part.type !== 'tool-proponer_precios_catalogo' &&
        part.type !== 'tool-proponer_edicion_partida' &&
        part.type !== 'tool-proponer_partidas' &&
        part.type !== 'tool-proponer_presupuesto'
      )
        continue
      const suggestion =
        part.type === 'tool-proponer_partidas'
          ? estimateProposalSchema.safeParse(part.input)
          : part.type === 'tool-proponer_presupuesto'
            ? estimateDraftProposalSchema.safeParse(part.input)
            : null
      if (suggestion?.success) {
        const text =
          'suggestion' in suggestion.data
            ? suggestion.data.suggestion.message
            : suggestion.data.message
        if (/[?¿]/.test(text)) turnHasQuestion = true
      }
      if (
        completed.has(part.toolCallId) &&
        (part.state === 'input-available' || part.state === 'output-available')
      ) {
        pending.delete(part.toolCallId)
        completedHere = true
      } else {
        pending.add(part.toolCallId)
      }
    }
    if (
      completedHere &&
      pending.size === 0 &&
      !turnHasQuestion &&
      messages[index + 1]?.role === 'user'
    )
      lastCompletedTurn = index
  }
  const afterCompleted = messages.slice(lastCompletedTurn + 1)
  const hasPending = (message: UIMessage) =>
    message.parts.some(
      (part) =>
        (part.type === 'tool-proponer_cliente' ||
          part.type === 'tool-proponer_edicion_cliente' ||
          part.type === 'tool-proponer_stock' ||
          part.type === 'tool-proponer_materiales' ||
          part.type === 'tool-proponer_precios_catalogo' ||
          part.type === 'tool-proponer_edicion_partida' ||
          part.type === 'tool-proponer_partidas' ||
          part.type === 'tool-proponer_presupuesto') &&
        (!completed.has(part.toolCallId) ||
          (part.state !== 'input-available' && part.state !== 'output-available')),
    )
  if (afterCompleted.slice(0, -20).some(hasPending)) throw new Error(pendingContextLimitMessage)
  const recent = afterCompleted.slice(-20)
  let users = 0
  let start = recent.length
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i]?.role === 'user' && ++users === 4) {
      start = i
      break
    }
  }
  const bounded =
    users < 4 || recent.slice(0, start).some(hasPending) ? recent : recent.slice(start)
  const firstUser = bounded.findIndex((message) => message.role === 'user')
  if (firstUser > 0 && bounded.slice(0, firstUser).some(hasPending))
    throw new Error(pendingContextLimitMessage)
  const selected = firstUser < 0 ? bounded : bounded.slice(firstUser)
  const lastUser =
    selected.length - 1 - [...selected].reverse().findIndex((message) => message.role === 'user')
  return selected.map((message, index) => {
    if (
      message.role !== 'user' ||
      index === lastUser ||
      !message.parts.some((part) => part.type === 'file')
    )
      return message
    return {
      ...message,
      parts: [
        ...message.parts.filter((part) => part.type !== 'file'),
        { type: 'text' as const, text: '[Adjuntos anteriores no incluidos]' },
      ],
    }
  })
}
