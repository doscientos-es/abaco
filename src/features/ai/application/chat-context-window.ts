import type { UIMessage } from 'ai'

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
        part.type !== 'tool-proponer_partidas' &&
        part.type !== 'tool-proponer_presupuesto'
      )
        continue
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
  const recent = afterCompleted.slice(-20)
  let users = 0
  let start = recent.length
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i]?.role === 'user' && ++users === 4) {
      start = i
      break
    }
  }
  const bounded = users < 4 ? recent : recent.slice(start)
  const firstUser = bounded.findIndex((message) => message.role === 'user')
  return firstUser < 0 ? bounded : bounded.slice(firstUser)
}
