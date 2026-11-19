import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CalendarEvent, CalendarEventChange } from '@/shared/lib/event-calendar'

import { StaffScheduleEditor } from './staff-schedule-editor'

const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  buttons: new Map<string, () => void>(),
  calendar: null as null | {
    items: CalendarEvent[]
    onRangeSelect: (range: { start: Date; end: Date }) => void
    onItemChange: (change: CalendarEventChange) => void
  },
  error: vi.fn(),
  save: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = mocks.cursor++
    if (!(index in mocks.states)) {
      mocks.states[index] = typeof initial === 'function' ? initial() : initial
    }
    return [
      mocks.states[index],
      (next: unknown) => {
        mocks.states[index] = typeof next === 'function' ? next(mocks.states[index]) : next
      },
    ]
  },
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children, onPress }: { children: string; onPress: () => void }) => {
    mocks.buttons.set(children, onPress)
    return null
  },
  toast: { error: mocks.error },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}))
vi.mock('../application/staff-schedule-actions', () => ({
  saveStaffSchedule: mocks.save,
  staffSchedulesQuery: () => ({ queryKey: ['staff-schedules', 'tenant'] }),
}))
vi.mock('./staff-function-picker', () => ({ StaffFunctionPicker: () => null }))
vi.mock('@/shared/ui/calendar-details-dialog', () => ({
  CalendarDetailsDialog: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/shared/ui/event-calendar', () => ({
  EventCalendar: (props: NonNullable<typeof mocks.calendar>) => {
    mocks.calendar = props
    return null
  },
}))

const person = {
  userId: 'ana',
  name: 'Ana',
  schedule: {
    userId: 'ana',
    updatedAt: 'version',
    functionIds: ['cleaning'],
    slots: [{ weekday: 1, start: 513, end: 1440 }],
  },
}
function render(onClose = vi.fn()) {
  mocks.cursor = 0
  return renderToStaticMarkup(
    <StaffScheduleEditor tenantId="tenant" person={person} functions={[]} onClose={onClose} />,
  )
}

describe('staff weekly schedule editor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.states = []
    mocks.buttons.clear()
    mocks.calendar = null
    mocks.save.mockResolvedValue(undefined)
    mocks.invalidate.mockResolvedValue(undefined)
  })

  it('preserves existing minute-precision and midnight slots while drawing and saving', async () => {
    const onClose = vi.fn()
    expect(render(onClose)).toContain('Dibuja el horario semanal')
    expect(mocks.calendar?.items[0]?.start).toEqual(new Date(2026, 0, 5, 8, 33))
    expect(mocks.calendar?.items[0]?.end).toEqual(new Date(2026, 0, 6, 0))
    mocks.calendar?.onRangeSelect({ start: new Date(2026, 0, 6, 9), end: new Date(2026, 0, 6, 12) })
    render(onClose)
    mocks.buttons.get('Guardar horario y funciones')?.()
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mocks.save).toHaveBeenCalledWith(
      'tenant',
      'ana',
      'version',
      [
        { weekday: 1, start: 513, end: 1440 },
        { weekday: 2, start: 540, end: 720 },
      ],
      ['cleaning'],
    )
  })

  it('moves shifts, rejects overlaps and cross-midnight staff shifts, and copies Monday', () => {
    render()
    const item = mocks.calendar?.items[0]
    if (!item) throw new Error('Missing staff event')
    mocks.calendar?.onItemChange({
      item,
      start: new Date(2026, 0, 6, 8),
      end: new Date(2026, 0, 6, 16),
      kind: 'move',
    })
    render()
    mocks.calendar?.onRangeSelect({ start: new Date(2026, 0, 6, 9), end: new Date(2026, 0, 6, 10) })
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('solaparse'))
    mocks.calendar?.onRangeSelect({ start: new Date(2026, 0, 7, 23), end: new Date(2026, 0, 8, 1) })
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('Revisa'))
    expect(mocks.states[0]).toEqual([{ weekday: 2, start: 480, end: 960 }])
    mocks.buttons.get('Copiar lunes a lunes–viernes')?.()
    expect(mocks.error).toHaveBeenCalledWith('Marca primero el horario del lunes.')
  })

  it('copies all Monday shifts to weekdays while preserving weekend shifts', () => {
    render()
    mocks.states[0] = [
      { weekday: 1, start: 480, end: 720 },
      { weekday: 1, start: 780, end: 1020 },
      { weekday: 7, start: 600, end: 720 },
    ]
    render()
    mocks.buttons.get('Copiar lunes a lunes–viernes')?.()
    expect(mocks.states[0]).toHaveLength(11)
    expect(mocks.states[0]).toEqual(
      expect.arrayContaining([
        { weekday: 5, start: 780, end: 1020 },
        { weekday: 7, start: 600, end: 720 },
      ]),
    )
  })
})
