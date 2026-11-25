import type { ClientInput } from './client-actions'

type AssistantField = 'name' | 'taxId' | 'email' | 'phone' | 'address'
export type ClientAssistantValues = Partial<Record<AssistantField, string | null | undefined>>

/** Apply actual streamed values without overwriting anything the user has edited. */
export function mergeClientAssistantValues(
  current: ClientInput,
  values: ClientAssistantValues,
  edited: ReadonlySet<keyof ClientInput>,
): ClientInput {
  let next = current
  for (const key of ['name', 'taxId', 'email', 'phone', 'address'] as const) {
    const value = values[key]
    if (typeof value !== 'string' || edited.has(key) || value === current[key]) continue
    if (next === current) next = { ...current }
    next[key] = value
  }
  return next
}
