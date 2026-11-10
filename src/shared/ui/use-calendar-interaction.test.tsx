import type { KeyboardEvent, PointerEvent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  calendarLocalInput,
  type CalendarEvent,
  type CalendarEventChange,
  type EventCalendarView,
} from '@/shared/lib/event-calendar'

import { useCalendarInteraction } from './use-calendar-interaction'

type Interaction = ReturnType<typeof useCalendarInteraction>
let api: Interaction
let hit: object | null
const changed = vi.fn<(change: CalendarEventChange) => void>()
const created = vi.fn()
const capture = vi.fn()
const item: CalendarEvent = {
  id: 'work',
  title: 'Work',
  start: new Date(2026, 10, 13, 9),
  end: new Date(2026, 10, 13, 10),
  editable: true,
}
function cell(day = '2026-11-13', timed = true) {
  const target = {
    dataset: { calendarDay: day, calendarTimed: String(timed) },
    getBoundingClientRect: () => ({ top: 0, height: 1440 }),
  }
  return { closest: () => target }
}
function setup(
  view: EventCalendarView = 'week',
  writable = true,
  scroller: object | null = null,
  selectable = false,
) {
  function Harness({ receive }: { receive: (value: Interaction) => void }) {
    receive(
      useCalendarInteraction({
        root: {
          current: {
            contains: () => true,
            querySelector: () => scroller,
          } as unknown as HTMLDivElement,
        },
        view,
        step: 15,
        onChange: writable ? changed : undefined,
        onCreate: selectable ? created : undefined,
      }),
    )
    return null
  }
  renderToStaticMarkup(
    <Harness
      receive={(value) => {
        api = value
      }}
    />,
  )
}
function pointer(y: number, x = 10, extra: object = {}) {
  return {
    clientX: x,
    clientY: y,
    pointerId: 1,
    button: 0,
    isPrimary: true,
    currentTarget: { setPointerCapture: capture },
    target: { closest: () => null },
    ...extra,
  } as unknown as PointerEvent<HTMLButtonElement> & PointerEvent<HTMLDivElement>
}
function key(name: string, extra: object = {}) {
  return {
    key: name,
    altKey: true,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...extra,
  } as unknown as KeyboardEvent<HTMLButtonElement>
}

describe('calendar pointer and keyboard interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hit = cell()
    vi.stubGlobal('document', { elementFromPoint: () => hit })
    setup()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps normal clicks separate from drag gestures', () => {
    api.start(pointer(550), item, 'move')
    api.move(pointer(552))
    api.finish(pointer(552))
    expect(changed).not.toHaveBeenCalled()
    expect(api.canClick()).toBe(true)
    expect(capture).toHaveBeenCalledWith(1)
  })

  it('creates a snapped range from empty space in either drag direction, without moving existing events', () => {
    setup('week', true, null, true)
    api.startSelection(pointer(542))
    api.move(pointer(661))
    api.finish(pointer(661))
    expect(created).toHaveBeenLastCalledWith({
      start: new Date(2026, 10, 13, 9),
      end: new Date(2026, 10, 13, 11),
    })
    api.startSelection(pointer(661))
    api.move(pointer(540))
    api.finish(pointer(540))
    expect(created).toHaveBeenLastCalledWith({
      start: new Date(2026, 10, 13, 9),
      end: new Date(2026, 10, 13, 11),
    })
    expect(changed).not.toHaveBeenCalled()
  })

  it('does not select over existing buttons, from secondary pointers, outside the grid, or after cancellation', () => {
    setup('week', true, null, true)
    api.startSelection(pointer(540, 10, { target: { closest: () => ({}) } }))
    api.finish(pointer(660))
    api.startSelection(pointer(540, 10, { isPrimary: false }))
    api.finish(pointer(660))
    api.startSelection(pointer(540))
    api.cancel()
    api.finish(pointer(660))
    api.startSelection(pointer(540))
    hit = null
    api.finish(pointer(660))
    expect(created).not.toHaveBeenCalled()
  })

  it('preserves the grab offset, snaps, changes day, and suppresses the post-drag click', () => {
    api.start(pointer(550), item, 'move')
    hit = cell('2026-11-14')
    api.move(pointer(640))
    api.finish(pointer(640))
    const result = changed.mock.calls[0]?.[0]
    expect(result?.kind).toBe('move')
    expect(result && calendarLocalInput(result.start)).toBe('2026-11-14T10:30')
    expect(result && calendarLocalInput(result.end)).toBe('2026-11-14T11:30')
    expect(api.canClick()).toBe(false)
  })

  it('resizes from the bottom without changing the start', () => {
    api.start(pointer(600), item, 'resize')
    api.move(pointer(675))
    api.finish(pointer(675))
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'resize',
        start: item.start,
        end: new Date(2026, 10, 13, 11, 15),
      }),
    )
  })

  it('cancels on Escape or pointer cancellation and never writes on an outside drop', () => {
    for (const cancel of ['escape', 'pointer', 'outside']) {
      api.start(pointer(550), item, 'move')
      api.move(pointer(640))
      if (cancel === 'escape') api.keyboard(key('Escape'), item)
      else if (cancel === 'pointer') api.cancel()
      else hit = null
      api.finish(pointer(640))
      hit = cell()
    }
    expect(changed).not.toHaveBeenCalled()
  })

  it('does not edit read-only events, secondary pointers, or disabled resize handles', () => {
    api.start(pointer(550), { ...item, editable: false }, 'move')
    api.finish(pointer(640))
    api.start(pointer(550, 10, { button: 2 }), item, 'move')
    api.finish(pointer(640))
    api.start(pointer(550, 10, { isPrimary: false }), item, 'move')
    api.finish(pointer(640))
    api.start(pointer(550), { ...item, resizable: false }, 'resize')
    api.finish(pointer(640))
    setup('week', false)
    api.start(pointer(550), item, 'move')
    api.finish(pointer(640))
    expect(capture).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()
  })

  it('moves month events by date while preserving the hour and supports inclusive all-day resizing', () => {
    setup('month')
    api.start(pointer(10), item, 'move')
    hit = cell('2026-11-15')
    api.move(pointer(20))
    api.finish(pointer(20))
    expect(changed.mock.calls[0]?.[0].start).toEqual(new Date(2026, 10, 15, 9))
    const absence = {
      ...item,
      allDay: true,
      start: new Date(2026, 10, 13),
      end: new Date(2026, 10, 14),
    }
    hit = cell()
    api.start(pointer(10), absence, 'resize')
    hit = cell('2026-11-16')
    api.move(pointer(20))
    api.finish(pointer(20))
    expect(changed.mock.calls[1]?.[0].end).toEqual(new Date(2026, 10, 17))
  })

  it('offers keyboard time/day movement and duration changes without hijacking normal arrows', () => {
    api.keyboard(key('ArrowDown', { altKey: false }), item)
    expect(changed).not.toHaveBeenCalled()
    api.keyboard(key('ArrowDown'), item)
    expect(changed.mock.calls[0]?.[0].start).toEqual(new Date(2026, 10, 13, 9, 15))
    api.keyboard(key('ArrowRight'), item)
    expect(changed.mock.calls[1]?.[0].start).toEqual(new Date(2026, 10, 14, 9))
    api.keyboard(key('ArrowDown', { shiftKey: true }), item)
    expect(changed.mock.calls[2]?.[0].end).toEqual(new Date(2026, 10, 13, 10, 15))
    api.keyboard(key('ArrowUp'), item, true)
    expect(changed.mock.calls[3]?.[0].kind).toBe('resize')
    api.keyboard(key('ArrowDown', { shiftKey: true }), { ...item, resizable: false })
    expect(changed).toHaveBeenCalledTimes(4)
  })

  it('auto-scrolls near the hourly grid edge and cancels its animation frame with the gesture', () => {
    const frames: FrameRequestCallback[] = []
    const cancelFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', cancelFrame)
    const scroller = {
      scrollTop: 0,
      scrollHeight: 1440,
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, bottom: 600, left: 0, right: 100 }),
    }
    setup('week', true, scroller)
    api.start(pointer(550), item, 'move')
    api.move(pointer(590))
    expect(frames).toHaveLength(1)
    frames[0]?.(0)
    expect(scroller.scrollTop).toBe(10)
    api.cancel()
    expect(cancelFrame).toHaveBeenCalledWith(2)
    expect(changed).not.toHaveBeenCalled()
  })
})
