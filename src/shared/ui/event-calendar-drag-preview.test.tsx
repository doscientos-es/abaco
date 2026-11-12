import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  CalendarEvent,
  CalendarEventChange,
  EventCalendarView,
} from '@/shared/lib/event-calendar'

import { EventCalendar } from './event-calendar'

const interaction = vi.hoisted(() => ({
  preview: null as CalendarEventChange | null,
  start: vi.fn(),
  startSelection: vi.fn(),
  move: vi.fn(),
  finish: vi.fn(),
  cancel: vi.fn(),
  keyboard: vi.fn(),
  canClick: () => true,
}))

vi.mock('./use-calendar-interaction', () => ({ useCalendarInteraction: () => interaction }))

const item: CalendarEvent = {
  id: 'work',
  title: 'Trabajo',
  start: new Date(2026, 10, 13, 9),
  end: new Date(2026, 10, 13, 10),
  editable: true,
}

function render(items: CalendarEvent[], view: EventCalendarView = 'week') {
  return renderToStaticMarkup(
    <EventCalendar
      value={new Date(2026, 10, 13, 12)}
      view={view}
      items={items}
      onItemClick={vi.fn()}
      onItemChange={vi.fn()}
    />,
  )
}

function day(html: string, date: string, timed?: boolean) {
  const selector = `data-calendar-day="${date}"${timed === undefined ? '' : ` data-calendar-timed="${timed}"`}`
  return html.split(selector)[1]?.split('data-calendar-day=')[0] ?? ''
}

describe('calendar drag preview', () => {
  beforeEach(() => {
    interaction.preview = null
  })

  it('keeps the captured original hidden and shows the moved event only at the destination', () => {
    interaction.preview = {
      item,
      kind: 'move',
      start: new Date(2026, 10, 14, 9),
      end: new Date(2026, 10, 14, 10),
    }
    const html = render([item])
    expect(day(html, '2026-11-13', true)).toMatch(/is-drag-source[^>]*aria-hidden="true"/)
    expect(day(html, '2026-11-13', true)).toContain('data-calendar-event="work" tabindex="-1"')
    expect(day(html, '2026-11-14', true)).toMatch(/is-preview[^>]*aria-hidden="true"/)
    expect(day(html, '2026-11-14', true)).toContain('data-calendar-event="__calendar-preview__"')

    interaction.preview = null
    const restored = render([item])
    expect(day(restored, '2026-11-13', true)).not.toContain('is-drag-source')
    expect(day(restored, '2026-11-14', true)).not.toContain('is-preview')
  })

  it('does not allocate a lane to the hidden source when resizing in the same day', () => {
    interaction.preview = {
      item,
      kind: 'resize',
      start: item.start,
      end: new Date(2026, 10, 13, 11),
    }
    const today = day(render([item]), '2026-11-13', true)
    expect(today).toMatch(/is-preview[^>]*width:calc\(100% - 4px\)/)
    expect(today).toContain('is-drag-source')
  })

  it('hides every original segment of a multi-day event while showing the new period', () => {
    const absence = {
      ...item,
      allDay: true,
      start: new Date(2026, 10, 13),
      end: new Date(2026, 10, 15),
    }
    interaction.preview = {
      item: absence,
      kind: 'move',
      start: new Date(2026, 10, 14),
      end: new Date(2026, 10, 16),
    }
    const html = render([absence], 'month')
    expect(day(html, '2026-11-13')).toContain('is-drag-source')
    expect(day(html, '2026-11-14')).toContain('is-drag-source')
    expect(day(html, '2026-11-14')).toContain('is-preview')
    expect(day(html, '2026-11-15')).toContain('is-preview')
  })

  it('keeps existing events visible when previewing a new selection', () => {
    interaction.preview = {
      item: { ...item, id: '__new-calendar-event__', title: 'Nueva franja' },
      kind: 'resize',
      start: new Date(2026, 10, 13, 11),
      end: new Date(2026, 10, 13, 12),
    }
    const html = render([item])
    expect(html).not.toContain('is-drag-source')
    expect(day(html, '2026-11-13', true)).toContain('data-calendar-event="work"')
    expect(day(html, '2026-11-13', true)).toContain('is-preview')
  })
})
