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
  const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-calendar-day]')
  if (
    !cell?.dataset.calendarDay ||
    !root.contains(cell) ||
    (view !== 'month' && cell.dataset.calendarTimed !== String(!item.allDay))
  )
    return null
  const day = calendarDate(cell.dataset.calendarDay)
  if (view === 'month' || item.allDay) return atCalendarMinutes(day, 0)
  const rect = cell.getBoundingClientRect()
  return atCalendarMinutes(day, Math.max(0, Math.min(1439, ((y - rect.top) / rect.height) * 1440)))
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
      offset: wallTimeNumber(point) - wallTimeNumber(origin),
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
    const point = pointDate(
      root.current,
      event.clientX,
      event.clientY,
      { allDay: false } as CalendarEvent,
      view,
    )
    if (!point) return
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
    if (scrollFrame.current === null && root.current.querySelector('.event-calendar__time-scroll'))
      scrollFrame.current = requestAnimationFrame(autoScroll)
  }
  function updatePreview() {
    const current = drag.current
    if (!current || !root.current) return
    const point = pointDate(
      root.current,
      lastPoint.current.x,
      lastPoint.current.y,
      current.item,
      view,
    )
    if (!point) {
      current.change = null
      setPreview(null)
      return
    }
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
    if (view === 'month' && !current.item.allDay)
      point.setHours(
        current.kind === 'move' ? current.item.start.getHours() : current.item.end.getHours(),
        current.kind === 'move' ? current.item.start.getMinutes() : current.item.end.getMinutes(),
      )
    if (current.kind === 'move') point.setMinutes(point.getMinutes() - current.offset / 60000)
    else if (
      current.item.allDay ||
      (view === 'month' && current.item.end.getHours() === 0 && current.item.end.getMinutes() === 0)
    )
      point.setDate(point.getDate() + 1)
    current.change = calendarChange(current.item, point, current.kind, step)
    setPreview(current.change)
  }
  function autoScroll() {
    scrollFrame.current = null
    const scroller = root.current?.querySelector<HTMLElement>('.event-calendar__time-scroll')
    if (!scroller || !drag.current?.active) return
    const bounds = scroller.getBoundingClientRect()
    const { x, y } = lastPoint.current
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return
    const delta = y < bounds.top + 40 ? -10 : y > bounds.bottom - 40 ? 10 : 0
    const before = scroller.scrollTop
    scroller.scrollTop = Math.max(
      0,
      Math.min(scroller.scrollHeight - scroller.clientHeight, before + delta),
    )
    if (scroller.scrollTop !== before) {
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
    if (item.allDay || event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      target.setDate(target.getDate() + direction)
    else target.setMinutes(target.getMinutes() + direction * step)
    onChange(calendarChange(item, target, kind, step))
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
