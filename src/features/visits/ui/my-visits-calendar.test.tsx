import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CalendarEvent } from '@/shared/lib/event-calendar'

import { MyVisitsCalendar } from './my-visits-calendar'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  query: null as null | (() => Promise<unknown>),
  items: [] as CalendarEvent[],
  click: null as null | ((item: CalendarEvent) => void),
  selectDay: null as null | ((day: Date) => void),
  data: [] as Array<Record<string, unknown>>,
}))

vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryFn }: { queryFn: () => Promise<unknown> }) => {
    mocks.query = queryFn
    return { data: mocks.data }
  },
}))
vi.mock('../application/visit-actions', () => ({ listMyVisits: mocks.list }))
vi.mock('@/shared/ui/event-calendar', () => ({
  EventCalendar: ({
    items,
    onItemClick,
    onDayClick,
  }: {
    items: CalendarEvent[]
    onItemClick: (item: CalendarEvent) => void
    onDayClick: (day: Date) => void
  }) => {
    mocks.items = items
    mocks.click = onItemClick
    mocks.selectDay = onDayClick
    return <div>Calendario</div>
  },
}))

describe('calendario de trabajos del usuario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.data = []
    mocks.query = null
    mocks.items = []
    mocks.click = null
    mocks.selectDay = null
    mocks.list.mockResolvedValue([])
  })

  it('opens the selected day without changing the calendar month navigation', () => {
    const selectDay = vi.fn()
    const navigateMonth = vi.fn()
    renderToStaticMarkup(
      <MyVisitsCalendar
        tenantId="tenant"
        date="2026-11-13"
        onDateChange={navigateMonth}
        onSelectDay={selectDay}
        onOpenGroup={vi.fn()}
      />,
    )
    mocks.selectDay?.(new Date(2026, 10, 17, 12))
    expect(selectDay).toHaveBeenCalledWith('2026-11-17')
    expect(navigateMonth).not.toHaveBeenCalled()
  })

  it('loads the complete month grid in ranges accepted by the assigned-visits API', async () => {
    renderToStaticMarkup(
      <MyVisitsCalendar
        tenantId="tenant"
        date="2026-11-13"
        onDateChange={vi.fn()}
        onSelectDay={vi.fn()}
        onOpenGroup={vi.fn()}
      />,
    )
    await mocks.query?.()
    expect(mocks.list).toHaveBeenCalledWith('tenant', '2026-10-26', '2026-11-26')
    expect(mocks.list).toHaveBeenCalledWith('tenant', '2026-11-27', '2026-12-06')
  })

  it('opens the selected contract and day to reveal its individual jobs', () => {
    const visit = {
      id: 'one',
      title: 'Fregar',
      client_name: 'Cliente',
      timezone: 'Europe/Madrid',
      scheduled_start_at: '2026-11-13T08:00:00Z',
      scheduled_end_at: '2026-11-13T09:00:00Z',
      status: 'scheduled',
      contract_id: 'contract',
      contract_title: 'Oficina',
    }
    mocks.data = [visit, { ...visit, id: 'two', title: 'Cristales' }]
    const open = vi.fn()
    renderToStaticMarkup(
      <MyVisitsCalendar
        tenantId="tenant"
        date="2026-11-13"
        onDateChange={vi.fn()}
        onSelectDay={vi.fn()}
        onOpenGroup={open}
      />,
    )
    expect(mocks.items).toHaveLength(1)
    const item = mocks.items[0]
    if (!item) throw new Error('Missing contract event')
    expect(item.title).toBe('Oficina')
    mocks.click?.(item)
    expect(open).toHaveBeenCalledWith('2026-11-13', 'contract')
  })
})
