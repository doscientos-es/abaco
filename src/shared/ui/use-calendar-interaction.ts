import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'

import { calendarDate } from '@/shared/lib/date-range'
import {
  atCalendarMinutes,
  calendarChange,
  wallTimeNumber,
  type CalendarEvent,
  type CalendarEventChange,
  type EventCalendarView,
} from '@/shared/lib/event-calendar'

type Drag = {
  item: CalendarEvent
  kind: 'move' | 'resize' | 'create'
  pointerId: number
  x: number
  y: number
  offset: number
  dayOffset: number
  active: boolean
  change: CalendarEventChange | null
}

function pointDate(
  root: HTMLElement,
  x: number,
  y: number,
  item: CalendarEvent,
  view: EventCalendarView,
) {
  const element = document.elementFromPoint(x, y)
  const dateTarget = element?.closest<HTMLElement>('[data-calendar-move-day]')
  if (dateTarget?.dataset.calendarMoveDay && root.contains(dateTarget))
    return { date: calendarDate(dateTarget.dataset.calendarMoveDay), dateOnly: true }
  const cell = element?.closest<HTMLElement>('[data-calendar-day]')
  if (
    !cell?.dataset.calendarDay ||
    !root.contains(cell) ||
    (view !== 'month' && cell.dataset.calendarTimed !== String(!item.allDay))
  )
    return null
  const day = calendarDate(cell.dataset.calendarDay)
  if (view === 'month' || item.allDay) return { date: atCalendarMinutes(day, 0), dateOnly: true }
  const rect = cell.getBoundingClientRect()
  return {
    date: atCalendarMinutes(
      day,
      Math.max(0, Math.min(1439, ((y - rect.top) / rect.height) * 1440)),
    ),
    dateOnly: false,
  }
}

function edgeScrollDelta(point: number, start: number, end: number) {
  return point < start + 40 ? -10 : point > end - 40 ? 10 : 0
}

export function useCalendarInteraction({
  root,
  view,
  step,
  onChange,
  onCreate,
}: {
  root: RefObject<HTMLDivElement | null>
  view: EventCalendarView
  step: number
  onChange: ((change: CalendarEventChange) => void) | undefined
  onCreate?: ((range: { start: Date; end: Date }) => void) | undefined
}) {
  const drag = useRef<Drag | null>(null)
  const blockedClick = useRef(0)
  const scrollFrame = useRef<number | null>(null)
  const lastPoint = useRef({ x: 0, y: 0 })
  const [preview, setPreview] = useState<CalendarEventChange | null>(null)
  const cancelOnEscape = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (event.key === 'Escape') cancel()
  })
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => cancelOnEscape(event)
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])
  useEffect(
    () => () => {
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current)
    },
    [],
  )
  function start(
    event: PointerEvent<HTMLButtonElement>,
    item: CalendarEvent,
    kind: 'move' | 'resize',
  ) {
    if (
      !onChange ||
      !item.editable ||
      (kind === 'resize' && item.resizable === false) ||
      event.button !== 0 ||
      !event.isPrimary ||
      !root.current
    )
      return
    const point = pointDate(root.current, event.clientX, event.clientY, item, view)
    if (!point) return
    const origin = view === 'month' || item.allDay ? atCalendarMinutes(item.start, 0) : item.start
    drag.current = {
      item,
      kind,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offset: wallTimeNumber(point.date) - wallTimeNumber(origin),
      dayOffset:
        wallTimeNumber(atCalendarMinutes(point.date, 0)) -
        wallTimeNumber(atCalendarMinutes(item.start, 0)),
      active: false,
      change: null,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function startSelection(event: PointerEvent<HTMLDivElement>) {
    if (
      !onCreate ||
      view === 'month' ||
      event.button !== 0 ||
      !event.isPrimary ||
      !root.current ||
      (event.target as HTMLElement).closest('button, input, select, textarea')
    )
      return
    const target = pointDate(
      root.current,
      event.clientX,
      event.clientY,
      { allDay: false } as CalendarEvent,
      view,
    )
    if (!target || target.dateOnly) return
    const point = target.date
    point.setMinutes(Math.floor(point.getMinutes() / step) * step, 0, 0)
    const end = atCalendarMinutes(point, point.getHours() * 60 + point.getMinutes() + step)
    const item: CalendarEvent = {
      id: '__new-calendar-event__',
      title: 'Nueva franja',
      start: point,
      end,
    }
    drag.current = {
      item,
      kind: 'create',
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offset: 0,
      dayOffset: 0,
      active: true,
      change: { item, start: point, end, kind: 'resize' },
    }
    setPreview(drag.current.change)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId || !root.current) return
    if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5)
      return
    current.active = true
    lastPoint.current = { x: event.clientX, y: event.clientY }
    updatePreview()
    if (
      scrollFrame.current === null &&
      (root.current.scrollWidth > root.current.clientWidth ||
        root.current.querySelector('.event-calendar__time-scroll'))
    )
      scrollFrame.current = requestAnimationFrame(autoScroll)
  }
  function updatePreview() {
    const current = drag.current
    if (!current || !root.current) return
    const target = pointDate(
      root.current,
      lastPoint.current.x,
      lastPoint.current.y,
      current.item,
      view,
    )
    if (
      !target ||
      (target.dateOnly && view !== 'month' && !current.item.allDay && current.kind !== 'move')
    ) {
      current.change = null
      setPreview(null)
      return
    }
    const point = target.date
    if (current.kind === 'create') {
      point.setMinutes(Math.round(point.getMinutes() / step) * step, 0, 0)
      const anchor = current.item.start
      const before = wallTimeNumber(point) < wallTimeNumber(anchor)
      const start = before ? point : anchor
      const end = before
        ? anchor
        : atCalendarMinutes(
            point,
            point.getHours() * 60 +
              point.getMinutes() +
              (point.getTime() === anchor.getTime() ? step : 0),
          )
      current.change = { item: current.item, start, end, kind: 'resize' }
      setPreview(current.change)
      return
    }
    if (target.dateOnly && !current.item.allDay)
      point.setHours(
        current.kind === 'move' ? current.item.start.getHours() : current.item.end.getHours(),
        current.kind === 'move' ? current.item.start.getMinutes() : current.item.end.getMinutes(),
      )
    if (current.kind === 'move')
      point.setMinutes(
        point.getMinutes() - (target.dateOnly ? current.dayOffset : current.offset) / 60000,
      )
    else if (
      current.item.allDay ||
      (view === 'month' && current.item.end.getHours() === 0 && current.item.end.getMinutes() === 0)
    )
      point.setDate(point.getDate() + 1)
    current.change = calendarChange(
      current.item,
      point,
      current.kind,
      target.dateOnly && current.kind === 'move' ? 1 : step,
    )
    setPreview(current.change)
  }
  function autoScroll() {
    scrollFrame.current = null
    const calendar = root.current
    if (!calendar || !drag.current?.active) return
    const { x, y } = lastPoint.current
    const inside = (bounds: DOMRect) =>
      x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom
    const scroller = calendar.querySelector<HTMLElement>('.event-calendar__time-scroll')
    const top = scroller?.scrollTop
    const left = calendar.scrollLeft
    if (scroller) {
      const bounds = scroller.getBoundingClientRect()
      if (inside(bounds))
        scroller.scrollTop = Math.max(
          0,
          Math.min(
            scroller.scrollHeight - scroller.clientHeight,
            scroller.scrollTop + edgeScrollDelta(y, bounds.top, bounds.bottom),
          ),
        )
    }
    if (calendar.scrollWidth > calendar.clientWidth) {
      const bounds = calendar.getBoundingClientRect()
      if (inside(bounds))
        calendar.scrollLeft = Math.max(
          0,
          Math.min(
            calendar.scrollWidth - calendar.clientWidth,
            left + edgeScrollDelta(x, bounds.left, bounds.right),
          ),
        )
    }
    if (scroller?.scrollTop !== top || calendar.scrollLeft !== left) {
      updatePreview()
      scrollFrame.current = requestAnimationFrame(autoScroll)
    }
  }
  function cancel() {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current)
    scrollFrame.current = null
    if (drag.current?.active) blockedClick.current = Date.now() + 400
    drag.current = null
    setPreview(null)
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return
    if (drag.current.active) move(event)
    const change = drag.current.change
    const creating = drag.current.kind === 'create'
    cancel()
    if (creating) {
      if (change) onCreate?.({ start: change.start, end: change.end })
      return
    }
    if (
      change &&
      (wallTimeNumber(change.start) !== wallTimeNumber(change.item.start) ||
        wallTimeNumber(change.end) !== wallTimeNumber(change.item.end))
    )
      onChange?.(change)
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, item: CalendarEvent, resize = false) {
    if (event.key === 'Escape') {
      cancel()
      return
    }
    if (
      !onChange ||
      !item.editable ||
      !event.altKey ||
      !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
    )
      return
    const kind = resize || event.shiftKey ? 'resize' : 'move'
    if (kind === 'resize' && item.resizable === false) return
    event.preventDefault()
    const target = new Date(kind === 'move' ? item.start : item.end)
    const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1
    const byDay = item.allDay || event.key === 'ArrowLeft' || event.key === 'ArrowRight'
    if (byDay) target.setDate(target.getDate() + direction)
    else target.setMinutes(target.getMinutes() + direction * step)
    onChange(calendarChange(item, target, kind, byDay && kind === 'move' ? 1 : step))
  }
  return {
    preview,
    start,
    startSelection,
    move,
    finish,
    cancel,
    keyboard,
    canClick: () => Date.now() >= blockedClick.current,
  }
}
