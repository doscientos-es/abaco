import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CalendarEvent } from '@/shared/lib/event-calendar'

import { MyVisitsCalendar } from './my-visits-calendar'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  selectedId: null as string | null,
  openGroup: undefined as (() => void) | undefined,
  query: null as null | (() => Promise<unknown>),
  items: [] as CalendarEvent[],
  click: null as null | ((item: CalendarEvent) => void),
  selectDay: null as null | ((day: Date) => void),
  navigateMonth: null as null | ((day: Date) => void),
  data: [] as Array<Record<string, unknown>>,
}))

vi.mock('react', async (load) => ({
  ...(await load<typeof React>()),
  useState: () => [mocks.selectedId, (id: string | null) => (mocks.selectedId = id)],
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children, onPress }: { children: string; onPress: () => void }) => {
    mocks.openGroup = onPress
    return <button>{children}</button>
  },
}))
vi.mock('@/shared/ui/calendar-details-dialog', () => ({
  CalendarDetailsDialog: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <dialog open aria-label={title}>
      {children}
    </dialog>
  ),
}))
vi.mock('@/shared/ui/calendar-toolbar', () => ({
  CalendarToolbar: ({ onDateChange }: { onDateChange: (day: Date) => void }) => {
    mocks.navigateMonth = onDateChange
    return null
  },
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
    mocks.selectedId = null
    mocks.openGroup = undefined
    mocks.data = []
    mocks.query = null
    mocks.items = []
    mocks.click = null
    mocks.selectDay = null
    mocks.navigateMonth = null
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
    mocks.navigateMonth?.(new Date(2026, 11, 13, 12))
    expect(navigateMonth).toHaveBeenCalledWith('2026-12-13')
    expect(selectDay).toHaveBeenCalledTimes(1)
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

  it('shows the individual jobs in a dialog before navigating to the selected contract and day', () => {
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
    const render = () =>
      renderToStaticMarkup(
        <MyVisitsCalendar
          tenantId="tenant"
          date="2026-11-13"
          onDateChange={vi.fn()}
          onSelectDay={vi.fn()}
          onOpenGroup={open}
        />,
      )
    render()
    expect(mocks.items).toHaveLength(1)
    const item = mocks.items[0]
    if (!item) throw new Error('Missing contract event')
    expect(item.title).toBe('Oficina')
    mocks.click?.(item)
    expect(open).not.toHaveBeenCalled()
    const details = render()
    expect(details).toContain('aria-label="Oficina"')
    expect(details).toContain('Fregar')
    expect(details).toContain('Cristales')
    mocks.openGroup?.()
    expect(open).toHaveBeenCalledWith('2026-11-13', 'contract')
    expect(mocks.selectedId).toBeNull()
  })
})
