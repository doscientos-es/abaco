import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CalendarEvent, CalendarEventChange } from '@/shared/lib/event-calendar'

import type { VacationRequest } from '../domain/vacation-request'
import { AbsenceOverview } from './absence-overview'

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  calendar: null as null | {
    items: CalendarEvent[]
    allDayOnly: boolean
    showInstructions: boolean
    value: Date
    onItemChange?: (change: CalendarEventChange) => void
    onDayClick: (day: Date) => void
  },
  buttons: new Map<string, () => void>(),
}))
vi.mock('@doscientos/ui', () => ({
  toast: { error: mocks.error },
  Button: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) => {
    if (typeof children === 'string' && onPress) mocks.buttons.set(children, onPress)
    return <button>{children}</button>
  },
  Popover: ({ trigger, children }: { trigger: ReactNode; children: ReactNode }) => (
    <>
      {trigger}
      {children}
    </>
  ),
}))
vi.mock('@/shared/ui/calendar-toolbar', () => ({ CalendarToolbar: () => null }))
vi.mock('@/shared/ui/event-calendar', () => ({
  EventCalendar: (props: NonNullable<typeof mocks.calendar>) => {
    mocks.calendar = props
    return null
  },
}))
vi.mock('@/shared/ui/calendar-details-dialog', () => ({
  CalendarDetailsDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
const request: VacationRequest = {
  id: 'absence',
  requesterId: 'ana',
  requesterName: 'Ana',
  absenceType: 'vacation',
  startDate: '2026-11-10',
  endDate: '2026-11-12',
  comment: 'TEST',
  status: 'approved',
  submittedAt: '',
  decisionComment: '',
  decidedAt: null,
  decidedByName: '',
  informationRequestComment: '',
  requesterResponseComment: '',
  updatedAt: 'original-version',
}

describe('absence overview calendar integration', () => {
  beforeEach(() => {
    mocks.calendar = null
    mocks.buttons.clear()
  })
  it('proposes an inclusive changed period against the original version without writing immediately', () => {
    const edit = vi.fn()
    const range = vi.fn()
    renderToStaticMarkup(
      <AbsenceOverview
        requests={[request]}
        from="2026-11-01"
        through="2026-11-30"
        onRange={range}
        onEdit={edit}
      />,
    )
    const item = mocks.calendar?.items[0]
    if (!item) throw new Error('Missing calendar item')
    expect(mocks.calendar?.allDayOnly).toBe(true)
    expect(mocks.calendar?.showInstructions).toBe(false)
    expect(edit).not.toHaveBeenCalled()
    mocks.calendar?.onItemChange?.({
      item,
      start: new Date(2026, 10, 20),
      end: new Date(2026, 10, 23),
      kind: 'move',
    })
    expect(edit).toHaveBeenCalledWith(request, { startDate: '2026-11-20', endDate: '2026-11-22' })
    edit.mockClear()
    mocks.calendar?.onItemChange?.({
      item: { ...item, revision: 'old-version' },
      start: new Date(2026, 10, 21),
      end: new Date(2026, 10, 24),
      kind: 'move',
    })
    expect(edit).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalled()
    mocks.calendar?.onDayClick(new Date(2026, 10, 13, 12))
    expect(range).toHaveBeenCalledWith('2026-11-13', '2026-11-13')
    expect(request.startDate).toBe('2026-11-10')
  })
  it('does not offer changes without an administrative edit callback', () => {
    renderToStaticMarkup(
      <AbsenceOverview requests={[request]} from="" through="" onRange={vi.fn()} />,
    )
    expect(mocks.calendar?.onItemChange).toBeUndefined()
    expect(mocks.calendar?.items[0]?.editable).toBe(false)
  })

  it('retains half-month filters and the occupancy explanation', () => {
    const onRange = vi.fn()
    const html = renderToStaticMarkup(
      <AbsenceOverview requests={[request]} from="" through="" onRange={onRange} />,
    )
    const date = mocks.calendar?.value
    if (!date) throw new Error('Missing calendar date')
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    mocks.buttons.get('Primera quincena')?.()
    mocks.buttons.get('Segunda quincena')?.()
    expect(onRange).toHaveBeenNthCalledWith(1, `${month}-01`, `${month}-15`)
    expect(onRange).toHaveBeenNthCalledWith(2, `${month}-16`, `${month}-${lastDay}`)
    expect(html).toContain('Aprobadas / pendientes')
    expect(html).toContain('no implica coincidencia en un mismo día')
    expect(html).not.toContain('<h2')
    expect(html).not.toContain('rounded-lg border p-4')
    expect(html).not.toContain('Pulsa un día')
  })
})
