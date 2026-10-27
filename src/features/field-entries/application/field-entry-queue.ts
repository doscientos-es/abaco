import type { FieldEntryKind } from './field-entry-actions'

export type PendingFieldEntry = {
  operationId: string
  kind: FieldEntryKind
  description: string
  quantity: number
  unit: string
  occurredAt: string
  supersedesId: string | null
}

const prefix = 'abaco:field-entry-queue:v1:'
const kinds = new Set<FieldEntryKind>([
  'labor',
  'travel',
  'material',
  'spare',
  'product',
  'corrective_action',
])

export function fieldEntryQueueKey(userId: string, tenantId: string, visitId: string) {
  return `${prefix}${userId}:${tenantId}:${visitId}`
}

export function readFieldEntryQueue(key: string): PendingFieldEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter(
      (item): item is PendingFieldEntry =>
        item !== null &&
        typeof item === 'object' &&
        typeof item.operationId === 'string' &&
        kinds.has(item.kind) &&
        typeof item.description === 'string' &&
        typeof item.quantity === 'number' &&
        Number.isFinite(item.quantity) &&
        typeof item.unit === 'string' &&
        typeof item.occurredAt === 'string' &&
        (item.supersedesId === null || typeof item.supersedesId === 'string'),
    )
  } catch {
    return []
  }
}

export function writeFieldEntryQueue(key: string, queue: PendingFieldEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(queue))
    return true
  } catch {
    return false
  }
}

export function clearFieldEntryQueues() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(prefix)) localStorage.removeItem(key)
    }
  } catch {
    // Storage can be unavailable in private browsing.
  }
}
