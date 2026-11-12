import { useEffect, useId, useRef, type ReactNode } from 'react'

import { dateValue } from '@/shared/lib/date-range'
import {
  calendarDays,
  eventIntersectsDay,
  timedEventLayout,
  type CalendarEvent,
  type CalendarEventChange,
  type EventCalendarView,
} from '@/shared/lib/event-calendar'

import { CalendarEventButton } from './calendar-event-button'
import { useCalendarInteraction } from './use-calendar-interaction'
import { useCalendarNow } from './use-calendar-now'

import './event-calendar.css'

const dayLabel = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

export function EventCalendar({
  items,
  value,
  view,
  minuteStep = 15,
  allDayOnly = false,
  showInstructions = true,
  onItemClick,
  onItemChange,
  onRangeSelect,
  showAllDay = true,
  showToday = true,
  renderDayLabel,
  onDayClick,
  renderItem,
  renderDaySummary,
  'aria-label': label = 'Calendario',
}: {
  items: CalendarEvent[]
  value: Date
  view: EventCalendarView
  minuteStep?: number
  allDayOnly?: boolean
  showInstructions?: boolean
  onItemClick: (item: CalendarEvent) => void
  onItemChange?: ((change: CalendarEventChange) => void) | undefined
  onRangeSelect?: ((range: { start: Date; end: Date }) => void) | undefined
  showAllDay?: boolean
  showToday?: boolean
  renderDayLabel?: ((day: Date) => ReactNode) | undefined
  onDayClick?: ((day: Date) => void) | undefined
  renderItem?: ((item: CalendarEvent) => ReactNode) | undefined
  renderDaySummary?: ((day: Date) => ReactNode) | undefined
  'aria-label'?: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const helpId = useId()
  const dateKey = dateValue(value)
  const now = useCalendarNow()
  const today = dateValue(now)
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  useEffect(() => {
    const scroller = root.current?.querySelector<HTMLElement>('.event-calendar__time-scroll')
    if (scroller) scroller.scrollTop = 7 * 60
  }, [view, dateKey])
  const interaction = useCalendarInteraction({
    root,
    view,
    step: minuteStep,
    onChange: onItemChange,
    onCreate: onRangeSelect,
  })
  const days = calendarDays(value, view)
  const previewId = '__calendar-preview__'
  const previewSource = interaction.preview
    ? items.find((item) => item.id === interaction.preview?.item.id)
    : undefined
  const displayItems = interaction.preview
    ? [
        ...items,
        {
          ...interaction.preview.item,
          id: previewId,
          start: interaction.preview.start,
          end: interaction.preview.end,
          editable: false,
        },
      ]
    : items
  function eventButton(item: CalendarEvent, timed = false, style?: React.CSSProperties) {
    const original = items.find((value) => value.id === item.id) ?? item
    return (
      <CalendarEventButton
        key={item.id}
        item={item}
        timed={timed}
        style={style}
        renderItem={renderItem}
        preview={item.id === previewId}
        dragSource={item.id === previewSource?.id}
        canEdit={Boolean(original.editable && onItemChange)}
        onOpen={() => {
          if (interaction.canClick()) onItemClick(original)
        }}
        onStart={(event, kind) => interaction.start(event, original, kind)}
        onKeyDown={(event, resize) => interaction.keyboard(event, original, resize)}
      />
    )
  }
  function dayHeader(day: Date) {
    return (
      <div
        className="event-calendar__day-header"
        data-today={showToday && dateValue(day) === today}
        aria-current={showToday && dateValue(day) === today ? 'date' : undefined}
      >
        {onDayClick ? (
          <button type="button" onClick={() => onDayClick(day)}>
            {renderDayLabel?.(day) ?? dayLabel.format(day)}
          </button>
        ) : (
          <span>{renderDayLabel?.(day) ?? dayLabel.format(day)}</span>
        )}
        {renderDaySummary?.(day)}
      </div>
    )
  }
  return (
    <section aria-label={label} aria-describedby={helpId} className="space-y-2">
      <p id={helpId} className={showInstructions ? 'text-muted-foreground text-xs' : 'sr-only'}>
        Pulsa un evento para ver detalles.
        {onItemChange
          ? ' Arrastra para mover; usa el borde inferior para cambiar el final. Teclado: Alt + flechas; Alt + Mayús + flechas cambia la duración. Esc cancela el arrastre.'
          : ''}
        {onRangeSelect ? ' Arrastra sobre un espacio vacío para marcar una nueva franja.' : ''}
      </p>
      <div
        className="event-calendar"
        ref={root}
        onPointerDown={interaction.startSelection}
        onPointerMove={interaction.move}
        onPointerUp={interaction.finish}
        onPointerCancel={interaction.cancel}
        onLostPointerCapture={interaction.cancel}
      >
        {view === 'month' ? (
          <div className="event-calendar__month">
            {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(
              (day) => (
                <div className="event-calendar__weekday" key={day}>
                  {day}
                </div>
              ),
            )}
            {days.map((day) => (
              <div
                key={dateValue(day)}
                className="event-calendar__month-day"
                data-calendar-day={dateValue(day)}
                data-outside={day.getMonth() !== value.getMonth()}
                data-today={showToday && dateValue(day) === today}
              >
                {dayHeader(day)}
                {displayItems
                  .filter((item) => eventIntersectsDay(item, day))
                  .sort(
                    (a, b) =>
                      Number(Boolean(b.allDay)) - Number(Boolean(a.allDay)) ||
                      a.start.getTime() - b.start.getTime(),
                  )
                  .map((item) => eventButton(item))}
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`event-calendar__schedule ${view === 'week' ? 'is-week' : ''} ${allDayOnly ? 'is-all-day-only' : ''}`}
            style={{ '--calendar-days': days.length } as React.CSSProperties}
          >
            <div className="event-calendar__headers">
              <span />
              {days.map((day) => (
                <div key={dateValue(day)}>{dayHeader(day)}</div>
              ))}
            </div>
            {showAllDay ? (
              <div className="event-calendar__all-day">
                <span className="event-calendar__time-label">Todo el día</span>
                {days.map((day) => (
                  <div
                    key={dateValue(day)}
                    data-calendar-day={dateValue(day)}
                    data-calendar-timed="false"
                    className="event-calendar__all-day-cell"
                  >
                    {displayItems
                      .filter((item) => item.allDay && eventIntersectsDay(item, day))
                      .map((item) => eventButton(item))}
                  </div>
                ))}
              </div>
            ) : null}
            {allDayOnly ? null : (
              <>
                {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the complete time grid. */}
                <section
                  className="event-calendar__time-scroll"
                  tabIndex={0}
                  aria-label="Horario de 00:00 a 24:00, desplazar para ver todas las horas"
                >
                  <div className="event-calendar__time-grid">
                    <div className="event-calendar__time-axis">
                      {Array.from({ length: 24 }, (_, hour) => (
                        <span key={hour} style={{ top: `${(hour / 24) * 100}%` }}>
                          {String(hour).padStart(2, '0')}:00
                        </span>
                      ))}
                    </div>
                    {days.map((day) => (
                      <div
                        key={dateValue(day)}
                        className="event-calendar__time-column"
                        data-calendar-day={dateValue(day)}
                        data-calendar-timed="true"
                        style={
                          onRangeSelect ? { touchAction: 'none', cursor: 'crosshair' } : undefined
                        }
                      >
                        {showToday && dateValue(day) === today ? (
                          <>
                            <span
                              className="event-calendar__now"
                              style={{ top: `${(currentMinutes / 1440) * 100}%` }}
                              aria-hidden="true"
                            />
                            <span className="sr-only">
                              Hora actual: {String(now.getHours()).padStart(2, '0')}:
                              {String(now.getMinutes()).padStart(2, '0')}
                            </span>
                          </>
                        ) : null}
                        {[
                          ...timedEventLayout(
                            displayItems.filter((item) => item.id !== previewSource?.id),
                            day,
                          ),
                          ...(previewSource &&
                          !previewSource.allDay &&
                          eventIntersectsDay(previewSource, day)
                            ? [{ item: previewSource, top: 0, height: 0, lane: 0, lanes: 1 }]
                            : []),
                        ].map(({ item, top, height, lane, lanes }) =>
                          eventButton(item, true, {
                            top: `${top}%`,
                            height: `${height}%`,
                            left: `calc(${(lane / lanes) * 100}% + 2px)`,
                            width: `calc(${100 / lanes}% - 4px)`,
                          }),
                        )}
                      </div>
                    ))}
                  </div>
                </section>
                {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
              </>
            )}
          </div>
        )}
      </div>
      <output className="sr-only" aria-live="polite">
        {interaction.preview
          ? `${interaction.preview.item.title}: ${interaction.preview.start.toLocaleString('es-ES')} — ${interaction.preview.end.toLocaleString('es-ES')}`
          : ''}
      </output>
    </section>
  )
}
