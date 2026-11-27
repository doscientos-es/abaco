import { describe, expect, it, vi } from 'vitest'

import { readRenamedPreference } from './renamed-preference-storage'

describe('renamed browser preferences', () => {
  it('copies the legacy value and prefers new values on subsequent reads', () => {
    const values = new Map([['abaco:table-columns:v1:clients', 'old']])
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    } as unknown as Storage
    const key = 'menoslios:table-columns:v1:clients'
    expect(readRenamedPreference(storage, key)).toBe('old')
    expect(values.get(key)).toBe('old')
    values.set(key, 'new')
    expect(readRenamedPreference(storage, key)).toBe('new')
  })

  it('returns the legacy value if the copy cannot be written', () => {
    const storage = {
      getItem: (key: string) => (key.startsWith('abaco:') ? 'old' : null),
      setItem: vi.fn(() => {
        throw new Error('storage full')
      }),
    } as unknown as Storage
    expect(readRenamedPreference(storage, 'menoslios:ledger-summary:v1:user')).toBe('old')
  })
})
