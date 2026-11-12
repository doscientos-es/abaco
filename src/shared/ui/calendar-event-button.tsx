import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'

import { calendarTime, type CalendarEvent } from '@/shared/lib/event-calendar'

export function CalendarEventButton({
  item,
  timed = false,
  preview = false,
  dragSource = false,
  canEdit,
  style,
  renderItem,
  onOpen,
  onStart,
  onKeyDown,
}: {
  item: CalendarEvent
  timed?: boolean
  preview?: boolean
  dragSource?: boolean
  canEdit: boolean
  style?: CSSProperties | undefined
  renderItem?: ((item: CalendarEvent) => React.ReactNode) | undefined
  onOpen: () => void
  onStart: (event: PointerEvent<HTMLButtonElement>, kind: 'move' | 'resize') => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, resize?: boolean) => void
}) {
  const hours = item.allDay
    ? 'Todo el día'
    : `${calendarTime(item.start)} – ${calendarTime(item.end)}`
  return (
    <div
      className={`event-calendar__event ${timed ? 'is-timed' : ''} ${preview ? 'is-preview' : ''} ${dragSource ? 'is-drag-source' : ''}`}
      style={style}
      data-tone={item.tone ?? 'primary'}
      aria-hidden={preview || dragSource || undefined}
    >
      <button
        type="button"
        className="event-calendar__event-body"
        aria-label={`${item.title}, ${hours}${item.description ? `, ${item.description}` : ''}`}
        data-calendar-event={item.id}
        tabIndex={preview || dragSource ? -1 : undefined}
        style={{ touchAction: canEdit ? 'none' : 'auto' }}
        onClick={onOpen}
        onKeyDown={(event) => onKeyDown(event)}
        onPointerDown={(event) => onStart(event, 'move')}
      >
        <span className="event-calendar__hours">{hours}</span>
        {renderItem?.(item) ?? <span className="event-calendar__title">{item.title}</span>}
      </button>
      {canEdit && item.resizable !== false ? (
        <button
          type="button"
          className="event-calendar__resize"
          aria-label={`Cambiar duración de ${item.title}`}
          tabIndex={dragSource ? -1 : undefined}
          title="Arrastra para cambiar el final; Alt + Mayús + flechas con el evento enfocado"
          onPointerDown={(event) => {
            event.stopPropagation()
            onStart(event, 'resize')
          }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => onKeyDown(event, true)}
        >
          <span />
        </button>
      ) : null}
    </div>
  )
}
