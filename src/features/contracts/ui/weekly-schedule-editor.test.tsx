import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CalendarEvent, CalendarEventChange } from '@/shared/lib/event-calendar'

import { WeeklyScheduleEditor } from './weekly-schedule-editor'

const mocks = vi.hoisted(() => ({
  calendar: null as null | {
    items: CalendarEvent[]
    onRangeSelect: (range: { start: Date; end: Date }) => void
    onItemChange: (change: CalendarEventChange) => void
  },
  error: vi.fn(),
  buttons: new Map<string, () => void>(),
}))
vi.mock('@/shared/ui/event-calendar', () => ({
  EventCalendar: (props: NonNullable<typeof mocks.calendar>) => {
    mocks.calendar = props
    return null
  },
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children, onPress }: { children: string; onPress: () => void }) => {
    mocks.buttons.set(children, onPress)
    return null
  },
  toast: { error: mocks.error },
}))
const slot = { id: 'morning', weekday: 1, start_minute: 540, duration_minutes: 120 }

describe('weekly contract calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.buttons.clear()
  })
  it('turns a drawn time range into a persistent slot with its own identity', () => {
    const changed = vi.fn()
    const html = renderToStaticMarkup(
      <WeeklyScheduleEditor
        value={[slot]}
        onChange={changed}
        startsOn="2026-11-13"
        endsOn="2026-11-30"
      />,
    )
    expect(html).toContain('3 trabajos previstos entre 2026-11-13 y 2026-11-30')
    mocks.calendar?.onRangeSelect({
      start: new Date(2026, 0, 6, 15),
      end: new Date(2026, 0, 6, 17, 30),
    })
    expect(changed).toHaveBeenCalledWith([
      slot,
      expect.objectContaining({
        id: expect.any(String),
        weekday: 2,
        start_minute: 900,
        duration_minutes: 150,
      }),
    ])
  })
  it('moves and resizes slots without changing their identity, and rejects overlaps', () => {
    const changed = vi.fn()
    renderToStaticMarkup(
      <WeeklyScheduleEditor
        value={[slot]}
        onChange={changed}
        startsOn="2026-11-13"
        endsOn="2026-11-30"
      />,
    )
    const item = mocks.calendar?.items[0]
    if (!item) throw new Error('Missing weekly event')
    mocks.calendar?.onItemChange({
      item,
      start: new Date(2026, 0, 7, 10),
      end: new Date(2026, 0, 7, 13),
      kind: 'move',
    })
    expect(changed).toHaveBeenCalledWith([
      { ...slot, weekday: 3, start_minute: 600, duration_minutes: 180 },
    ])
    changed.mockClear()
    mocks.calendar?.onRangeSelect({
      start: new Date(2026, 0, 5, 10),
      end: new Date(2026, 0, 5, 12),
    })
    expect(changed).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('solaparse'))
  })

  it('copies split Monday shifts to weekdays, preserving Monday and weekend identities', () => {
    const afternoon = { ...slot, id: 'afternoon', start_minute: 900 }
    const weekend = { ...slot, id: 'weekend', weekday: 7 }
    const changed = vi.fn()
    renderToStaticMarkup(
      <WeeklyScheduleEditor
        value={[slot, afternoon, weekend]}
        onChange={changed}
        startsOn="2026-11-13"
        endsOn="2026-11-30"
      />,
    )
    mocks.buttons.get('Copiar lunes a lunes–viernes')?.()
    const result = changed.mock.calls[0]?.[0] as (typeof slot)[]
    expect(result).toHaveLength(11)
    expect(result).toEqual(expect.arrayContaining([slot, afternoon, weekend]))
    expect(new Set(result.map((s) => s.id)).size).toBe(11)
    expect(result.filter((s) => s.weekday === 5).map((s) => s.start_minute)).toEqual([540, 900])
  })

  it('uses the actual reference week for monthly work and replaces rather than adds reference slots', () => {
    const changed = vi.fn()
    const html = renderToStaticMarkup(
      <WeeklyScheduleEditor
        value={[slot]}
        onChange={changed}
        startsOn="2026-11-16"
        endsOn="2027-02-28"
        referenceDate="2026-11-16"
        recurrenceLabel="cada mes"
      />,
    )
    expect(mocks.calendar?.items[0]?.start).toEqual(new Date(2026, 10, 16, 9))
    expect(html).toContain('cada mes')
    expect(mocks.buttons.has('Copiar lunes a lunes–viernes')).toBe(false)
    mocks.calendar?.onRangeSelect({
      start: new Date(2026, 10, 18, 15),
      end: new Date(2026, 10, 18, 17),
    })
    expect(changed).toHaveBeenCalledWith([
      expect.objectContaining({ weekday: 3, start_minute: 900, duration_minutes: 120 }),
    ])
  })
})
