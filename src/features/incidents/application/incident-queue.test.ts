import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearVisitIncidentQueues,
  readVisitIncidentQueue,
  visitIncidentQueueKey,
  writeVisitIncidentQueue,
} from './incident-queue'

describe('pending visit incidents', () => {
  const values = new Map<string, string>()
  beforeEach(() => {
    values.clear()
    vi.stubGlobal('localStorage', {
      get length() {
        return values.size
      },
      key(index: number) {
        return [...values.keys()][index] ?? null
      },
      getItem(key: string) {
        return values.get(key) ?? null
      },
      setItem(key: string, value: string) {
        values.set(key, value)
      },
      removeItem(key: string) {
        values.delete(key)
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('preserves the operation ID and isolates user, company and visit', () => {
    const key = visitIncidentQueueKey('user-a', 'tenant-a', 'visit-a')
    const item = {
      operationId: 'operation-a',
      title: 'Fuga',
      description: 'Acople',
      priority: 'high' as const,
    }
    expect(writeVisitIncidentQueue(key, [item])).toBe(true)
    expect(readVisitIncidentQueue(key)).toEqual([item])
    expect(readVisitIncidentQueue(visitIncidentQueueKey('user-b', 'tenant-a', 'visit-a'))).toEqual(
      [],
    )
    expect(readVisitIncidentQueue(visitIncidentQueueKey('user-a', 'tenant-b', 'visit-a'))).toEqual(
      [],
    )
    expect(readVisitIncidentQueue(visitIncidentQueueKey('user-a', 'tenant-a', 'visit-b'))).toEqual(
      [],
    )
  })

  it('clears pending incidents on sign out without touching other keys', () => {
    values.set('unrelated', 'keep')
    writeVisitIncidentQueue(visitIncidentQueueKey('user-a', 'tenant-a', 'visit-a'), [
      {
        operationId: 'operation-a',
        title: 'Fuga',
        description: 'Acople',
        priority: 'high',
      },
    ])
    clearVisitIncidentQueues()
    expect(values.get('unrelated')).toBe('keep')
    expect(values.size).toBe(1)
  })
})
