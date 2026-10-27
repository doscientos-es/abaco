import type { IncidentPriority } from './incident-actions'

export type PendingVisitIncident = {
  operationId: string
  title: string
  description: string
  priority: IncidentPriority
}

const prefix = 'abaco:visit-incident-queue:v1:'

export function visitIncidentQueueKey(userId: string, tenantId: string, visitId: string) {
  return `${prefix}${userId}:${tenantId}:${visitId}`
}

export function readVisitIncidentQueue(key: string): PendingVisitIncident[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is PendingVisitIncident =>
        item !== null &&
        typeof item === 'object' &&
        typeof item.operationId === 'string' &&
        typeof item.title === 'string' &&
        typeof item.description === 'string' &&
        ['low', 'normal', 'high', 'urgent'].includes(item.priority),
    )
  } catch {
    return []
  }
}

export function writeVisitIncidentQueue(key: string, queue: PendingVisitIncident[]) {
  try {
    localStorage.setItem(key, JSON.stringify(queue))
    return true
  } catch {
    return false
  }
}

export function clearVisitIncidentQueues() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(prefix)) localStorage.removeItem(key)
    }
  } catch {
    // Storage can be unavailable in private browsing.
  }
}
