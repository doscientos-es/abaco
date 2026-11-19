import { describe, expect, it } from 'vitest'

import { calendarColors, resolveCalendarColor } from './calendar-color'

function luminance(hex: string) {
  const values = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const linear = values.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
}

describe('calendar colors', () => {
  it('uses a stable automatic color and honors a valid preference', () => {
    expect(resolveCalendarColor('same-person')).toBe(resolveCalendarColor('same-person', 'unknown'))
    expect(resolveCalendarColor('same-person', 'blue')).toBe('blue')
  })

  it('keeps dark calendar text readable on every background', () => {
    for (const color of calendarColors) {
      const contrast = (luminance(color.background) + 0.05) / (luminance('#17271b') + 0.05)
      expect(contrast).toBeGreaterThanOrEqual(4.5)
    }
  })
})
