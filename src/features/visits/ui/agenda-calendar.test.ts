import { describe, expect, it } from 'vitest'

import { toCalendarWallTime } from './agenda-calendar'

describe('agenda calendar helpers', () => {
  it('preserves the visit timezone wall time', () => {
    expect(toCalendarWallTime('2026-06-08T07:00:00.000Z', 'Europe/Madrid').getHours()).toBe(9)
  })
})
