import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearReferral, rememberReferral } from './referral-storage'

describe('referral storage', () => {
  const values = new Map<string, string>()

  beforeEach(() => {
    values.clear()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    })
    clearReferral()
  })

  afterEach(() => {
    clearReferral()
    vi.unstubAllGlobals()
  })

  it('persists the last valid invitation across navigation and ignores invalid links', () => {
    expect(rememberReferral('?r=ab12cd34ef56ab78')).toBe('AB12CD34EF56AB78')
    expect(rememberReferral('')).toBe('AB12CD34EF56AB78')
    expect(rememberReferral('?r=invalid')).toBe('AB12CD34EF56AB78')
    expect(rememberReferral('?r=1111111111111111')).toBe('1111111111111111')
    expect(rememberReferral('')).toBe('1111111111111111')
    clearReferral()
    expect(rememberReferral('')).toBeNull()
  })

  it('keeps the invitation for the session when browser storage is unavailable', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('Storage blocked')
      },
    })
    expect(rememberReferral('?r=AB12CD34EF56AB78')).toBe('AB12CD34EF56AB78')
    expect(rememberReferral('')).toBe('AB12CD34EF56AB78')
    clearReferral()
    expect(rememberReferral('')).toBeNull()
  })

  it('prefers a newer invitation in memory when storage refuses writes', () => {
    values.set('abaco.referral-code', '1111111111111111')
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: () => {
          throw new Error('Storage full')
        },
        removeItem: (key: string) => values.delete(key),
      },
    })
    expect(rememberReferral('?r=AB12CD34EF56AB78')).toBe('AB12CD34EF56AB78')
    expect(rememberReferral('')).toBe('AB12CD34EF56AB78')
  })

  it('does not reuse an invitation when clearing browser storage fails', () => {
    rememberReferral('?r=1111111111111111')
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: () => {
          throw new Error('Storage blocked')
        },
      },
    })
    clearReferral()
    expect(rememberReferral('')).toBeNull()
  })
})
