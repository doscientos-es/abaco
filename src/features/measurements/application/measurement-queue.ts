export type PendingMeasurement = {
  operationId: string
  parameterId: string
  value: number
  method: string
  device: string
  measuredAt: string
  supersedesId: string | null
}

const prefix = 'abaco:measurement-queue:v1:'

export function measurementQueueKey(userId: string, tenantId: string, visitId: string) {
  return `${prefix}${userId}:${tenantId}:${visitId}`
}

export function readMeasurementQueue(key: string): PendingMeasurement[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter(
      (item): item is PendingMeasurement =>
        item !== null &&
        typeof item === 'object' &&
        typeof item.operationId === 'string' &&
        typeof item.parameterId === 'string' &&
        typeof item.value === 'number' &&
        Number.isFinite(item.value) &&
        typeof item.method === 'string' &&
        typeof item.device === 'string' &&
        typeof item.measuredAt === 'string' &&
        (item.supersedesId === null || typeof item.supersedesId === 'string'),
    )
  } catch {
    return []
  }
}

export function writeMeasurementQueue(key: string, queue: PendingMeasurement[]) {
  try {
    localStorage.setItem(key, JSON.stringify(queue))
    return true
  } catch {
    return false
  }
}

export function clearMeasurementQueues() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(prefix)) localStorage.removeItem(key)
    }
  } catch {
    // Storage can be unavailable in private browsing.
  }
}
