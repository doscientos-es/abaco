import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearFieldEntryQueues,
  fieldEntryQueueKey,
  readFieldEntryQueue,
  writeFieldEntryQueue,
} from './field-entry-queue'

describe('field evidence recovery', () => {
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

  it('recovers a stable operation only for the same user, company and visit', () => {
    const key = fieldEntryQueueKey('user-a', 'tenant-a', 'visit-a')
    const item = {
      operationId: 'operation-a',
      kind: 'material' as const,
      description: 'Junta',
      quantity: 2,
      unit: 'ud',
      occurredAt: '2026-10-22T18:00:00.000Z',
      supersedesId: null,
    }
    expect(writeFieldEntryQueue(key, [item])).toBe(true)
    expect(readFieldEntryQueue(key)).toEqual([item])
    expect(readFieldEntryQueue(fieldEntryQueueKey('user-b', 'tenant-a', 'visit-a'))).toEqual([])
    expect(readFieldEntryQueue(fieldEntryQueueKey('user-a', 'tenant-b', 'visit-a'))).toEqual([])
    expect(readFieldEntryQueue(fieldEntryQueueKey('user-a', 'tenant-a', 'visit-b'))).toEqual([])
  })

  it('removes pending evidence on sign out while preserving unrelated storage', () => {
    values.set('unrelated', 'keep')
    writeFieldEntryQueue(fieldEntryQueueKey('user-a', 'tenant-a', 'visit-a'), [
      {
        operationId: 'operation-a',
        kind: 'labor',
        description: 'Revisión',
        quantity: 30,
        unit: 'min',
        occurredAt: '2026-10-22T18:00:00.000Z',
        supersedesId: null,
      },
    ])
    clearFieldEntryQueues()
    expect(values.get('unrelated')).toBe('keep')
    expect(values.size).toBe(1)
  })
})
