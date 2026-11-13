import { describe, expect, it, vi } from 'vitest'

import { warnBeforeLeavingWithPendingSaves } from './pwa-runtime'

const { status } = vi.hoisted(() => ({ status: vi.fn() }))
vi.mock('@/shared/store/store', () => ({ getSaveStatus: status }))

describe('pending saves', () => {
  it('warns before closing or reloading only while changes are not confirmed', () => {
    const target = new EventTarget()
    const cleanup = warnBeforeLeavingWithPendingSaves(target as unknown as Window)
    const event = new Event('beforeunload', { cancelable: true })
    status.mockReturnValue({ state: 'saved' })
    expect(target.dispatchEvent(event)).toBe(true)
    status.mockReturnValue({ state: 'error' })
    expect(target.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(false)
    status.mockReturnValue({ state: 'saving' })
    expect(target.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(false)
    cleanup()
    expect(target.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true)
  })
})
