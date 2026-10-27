import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearMeasurementQueues,
  measurementQueueKey,
  readMeasurementQueue,
  writeMeasurementQueue,
} from './measurement-queue'

describe('pending measurement recovery', () => {
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

  it('recovers the same operation only for its user, company and visit', () => {
    const key = measurementQueueKey('user-a', 'tenant-a', 'visit-a')
    const item = {
      operationId: 'operation-a',
      parameterId: 'parameter-a',
      value: 7.4,
      method: 'Medidor',
      device: '',
      measuredAt: '2026-10-22T18:00:00.000Z',
      supersedesId: null,
    }
    expect(writeMeasurementQueue(key, [item])).toBe(true)
    expect(readMeasurementQueue(key)).toEqual([item])
    expect(readMeasurementQueue(measurementQueueKey('user-b', 'tenant-a', 'visit-a'))).toEqual([])
    expect(readMeasurementQueue(measurementQueueKey('user-a', 'tenant-b', 'visit-a'))).toEqual([])
    expect(readMeasurementQueue(measurementQueueKey('user-a', 'tenant-a', 'visit-b'))).toEqual([])
  })

  it('removes pending readings on sign out and preserves unrelated keys', () => {
    values.set('unrelated', 'keep')
    writeMeasurementQueue(measurementQueueKey('user-a', 'tenant-a', 'visit-a'), [
      {
        operationId: 'operation-a',
        parameterId: 'parameter-a',
        value: 7.4,
        method: 'Medidor',
        device: '',
        measuredAt: '2026-10-22T18:00:00.000Z',
        supersedesId: null,
      },
    ])
    clearMeasurementQueues()
    expect(values.get('unrelated')).toBe('keep')
    expect(values.size).toBe(1)
  })
})
