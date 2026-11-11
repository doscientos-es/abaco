import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearLegacyMeasurementQueues } from './legacy-measurement-storage'

afterEach(() => vi.unstubAllGlobals())

describe('retired pool storage cleanup on sign out', () => {
  it('removes every old reading queue without touching current app data', () => {
    const values = new Map([
      ['abaco:measurement-queue:v1:user-a:tenant-a:visit-a', '[]'],
      ['abaco:measurement-queue:v1:user-b:tenant-b:visit-b', '[]'],
      ['abaco:visit-report-draft:v1:current', 'keep'],
    ])
    vi.stubGlobal('localStorage', {
      get length() {
        return values.size
      },
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
    })
    clearLegacyMeasurementQueues()
    expect([...values.entries()]).toEqual([['abaco:visit-report-draft:v1:current', 'keep']])
  })

  it('does not prevent signing out when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      get length() {
        throw new Error('Storage unavailable')
      },
    })
    expect(() => clearLegacyMeasurementQueues()).not.toThrow()
  })
})
