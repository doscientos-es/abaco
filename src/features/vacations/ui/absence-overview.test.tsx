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
    renderDaySummary?: unknown
    onItemChange?: (change: CalendarEventChange) => void
    onDayClick: (day: Date) => void
  },
}))
vi.mock('@doscientos/ui', () => ({
  toast: { error: mocks.error },
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
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
  })
  it('proposes an inclusive changed period against the original version without writing immediately', () => {
    const edit = vi.fn()
    const range = vi.fn()
    renderToStaticMarkup(<AbsenceOverview requests={[request]} onRange={range} onEdit={edit} />)
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
    renderToStaticMarkup(<AbsenceOverview requests={[request]} onRange={vi.fn()} />)
    expect(mocks.calendar?.onItemChange).toBeUndefined()
    expect(mocks.calendar?.items[0]?.editable).toBe(false)
  })

  it('shows a clean calendar without half-month controls or occupancy counts', () => {
    const html = renderToStaticMarkup(<AbsenceOverview requests={[request]} onRange={vi.fn()} />)
    expect(html).not.toContain('quincena')
    expect(html).not.toContain('Aprobadas / pendientes')
    expect(html).not.toContain('personas aprobadas')
    expect(mocks.calendar?.renderDaySummary).toBeUndefined()
    expect(html).not.toContain('<h2')
    expect(html).not.toContain('rounded-lg border p-4')
    expect(html).not.toContain('Pulsa un día')
  })
})
