import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { CalendarEvent } from '@/shared/lib/event-calendar'

import { EventCalendar } from './event-calendar'

const value = new Date(2026, 10, 13, 12)
const item: CalendarEvent = {
  id: 'test',
  title: 'Limpieza',
  start: new Date(2026, 10, 13, 9),
  end: new Date(2026, 10, 13, 10, 30),
  editable: true,
}
describe('event calendar presentation', () => {
  it('renders explicit start/end hours, a resize handle and keyboard help in the day view', () => {
    const html = renderToStaticMarkup(
      <EventCalendar
        value={value}
        view="day"
        items={[item]}
        onItemClick={vi.fn()}
        onItemChange={vi.fn()}
      />,
    )
    expect(html).toContain('09:00 – 10:30')
    expect(html).toContain('Cambiar duración de Limpieza')
    expect(html).toContain('Alt + Mayús')
    expect(html).toContain('top:37.5%')
    expect(html).toContain('height:6.25%')
    expect(html).toContain('23:00')
  })
  it('renders a full seven-day time grid and clips overnight events into two visible segments', () => {
    const night = { ...item, start: new Date(2026, 10, 13, 23), end: new Date(2026, 10, 14, 1) }
    const html = renderToStaticMarkup(
      <EventCalendar value={value} view="week" items={[night]} onItemClick={vi.fn()} />,
    )
    expect(html.match(/data-calendar-timed="true"/g)).toHaveLength(7)
    expect(html.match(/data-calendar-event="test"/g)).toHaveLength(2)
    expect(html).not.toContain('Cambiar duración')
  })
  it('renders multi-day all-day events without invented hours or resize controls for non-duration records', () => {
    const absence = {
      ...item,
      start: new Date(2026, 10, 12),
      end: new Date(2026, 10, 14),
      allDay: true,
      resizable: false,
    }
    const html = renderToStaticMarkup(
      <EventCalendar
        value={value}
        view="week"
        items={[absence]}
        allDayOnly
        onItemClick={vi.fn()}
        onItemChange={vi.fn()}
      />,
    )
    expect(html.match(/data-calendar-event="test"/g)).toHaveLength(2)
    expect(html).toContain('Todo el día')
    expect(html).not.toContain('data-calendar-timed="true"')
    expect(html).not.toContain('Cambiar duración')
  })
  it('renders the 42-day month grid with clickable event buttons and full duration labels', () => {
    const html = renderToStaticMarkup(
      <EventCalendar
        value={value}
        view="month"
        items={[item]}
        onItemClick={vi.fn()}
        onItemChange={vi.fn()}
      />,
    )
    expect(html.match(/data-calendar-day=/g)).toHaveLength(42)
    expect(html).toContain('aria-label="Limpieza, 09:00 – 10:30"')
    expect(html).toContain('data-outside="true"')
  })
  it('can visually hide instructions while retaining them for assistive technology', () => {
    const html = renderToStaticMarkup(
      <EventCalendar
        value={value}
        view="month"
        items={[item]}
        onItemClick={vi.fn()}
        showInstructions={false}
      />,
    )
    expect(html).toMatch(/aria-describedby="[^"]+"/)
    expect(html).toMatch(/<p id="[^"]+" class="sr-only">Pulsa un evento/)
    expect(html).toContain('data-calendar-event="test"')
  })
})
