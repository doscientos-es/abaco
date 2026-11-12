import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCalendarNow } from './use-calendar-now'

const hooks = vi.hoisted(() => ({ effect: vi.fn(), setNow: vi.fn() }))
vi.mock('react', () => ({
  useState: (initial: () => Date) => [initial(), hooks.setNow],
  useEffect: hooks.effect,
}))

describe('calendar clock', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('updates at the next minute, rolls over midnight and cleans up', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 13, 23, 59, 58))
    const listeners = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      visibilityState: 'visible',
    }
    vi.stubGlobal('document', listeners)
    expect(useCalendarNow()).toEqual(new Date(2026, 10, 13, 23, 59, 58))
    const cleanup = hooks.effect.mock.calls[0]?.[0]()
    expect(hooks.setNow).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(hooks.setNow).toHaveBeenLastCalledWith(new Date(2026, 10, 14, 0, 0))
    cleanup()
    vi.advanceTimersByTime(60_000)
    expect(hooks.setNow).toHaveBeenCalledTimes(2)
    expect(listeners.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    )
  })

  it('refreshes immediately when the page becomes visible', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 13, 10, 0))
    const listeners = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      visibilityState: 'visible',
    }
    vi.stubGlobal('document', listeners)
    useCalendarNow()
    const cleanup = hooks.effect.mock.calls[0]?.[0]()
    vi.setSystemTime(new Date(2026, 10, 13, 12, 15))
    listeners.addEventListener.mock.calls[0]?.[1]()
    expect(hooks.setNow).toHaveBeenLastCalledWith(new Date(2026, 10, 13, 12, 15))
    cleanup()
  })
})
