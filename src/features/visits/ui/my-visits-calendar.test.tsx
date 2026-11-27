import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CalendarEvent } from '@/shared/lib/event-calendar'

import { MyVisitsCalendar } from './my-visits-calendar'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  selectedId: null as string | null,
  view: 'week' as 'week' | 'month',
  actions: new Map<string, () => void>(),
  query: null as null | (() => Promise<unknown>),
  items: [] as CalendarEvent[],
  click: null as null | ((item: CalendarEvent) => void),
  selectDay: null as null | ((day: Date) => void),
  navigateMonth: null as null | ((day: Date) => void),
  data: [] as Array<Record<string, unknown>>,
}))

vi.mock('react', async (load) => ({
  ...(await load<typeof React>()),
  useState: (initial: unknown) =>
    initial === 'week'
      ? [mocks.view, (view: 'week' | 'month') => (mocks.view = view)]
      : [mocks.selectedId, (id: string | null) => (mocks.selectedId = id)],
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({
    children,
    onPress,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode
    onPress: () => void
    'aria-label'?: string
  }) => {
    const name =
      ariaLabel ?? (typeof children === 'string' ? children : renderToStaticMarkup(<>{children}</>))
    mocks.actions.set(name, onPress)
    return <button aria-label={ariaLabel}>{children}</button>
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
  CalendarToolbar: ({
    onDateChange,
    actions,
  }: {
    onDateChange: (day: Date) => void
    actions: React.ReactNode
  }) => {
    mocks.navigateMonth = onDateChange
    return <>{actions}</>
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
    mocks.view = 'week'
    mocks.actions.clear()
    mocks.data = []
    mocks.query = null
    mocks.items = []
    mocks.click = null
    mocks.selectDay = null
    mocks.navigateMonth = null
    mocks.list.mockResolvedValue([])
  })

  it('defaults to a readable weekly agenda and gives a useful empty state', async () => {
    const html = renderToStaticMarkup(
      <MyVisitsCalendar
        tenantId="tenant"
        date="2026-11-13"
        onDateChange={vi.fn()}
        onSelectDay={vi.fn()}
        onOpenVisit={vi.fn()}
      />,
    )
    expect(html).toContain('No tienes visitas esta semana')
    expect(html).toContain('Semana')
    expect(mocks.actions.has('Mes')).toBe(true)
    await mocks.query?.()
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith('tenant', '2026-11-09', '2026-11-15')
    mocks.actions.get('Mes')?.()
    expect(mocks.view).toBe('month')
  })

  it('opens the selected day without changing the calendar month navigation', () => {
    mocks.view = 'month'
    const selectDay = vi.fn()
    const navigateMonth = vi.fn()
    renderToStaticMarkup(
      <MyVisitsCalendar
        tenantId="tenant"
        date="2026-11-13"
        onDateChange={navigateMonth}
        onSelectDay={selectDay}
        onOpenVisit={vi.fn()}
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
    mocks.view = 'month'
    renderToStaticMarkup(
      <MyVisitsCalendar
        tenantId="tenant"
        date="2026-11-13"
        onDateChange={vi.fn()}
        onSelectDay={vi.fn()}
        onOpenVisit={vi.fn()}
      />,
    )
    await mocks.query?.()
    expect(mocks.list).toHaveBeenCalledWith('tenant', '2026-10-26', '2026-11-26')
    expect(mocks.list).toHaveBeenCalledWith('tenant', '2026-11-27', '2026-12-06')
  })

  it('opens a precise visit from the contracted day dialog', () => {
    mocks.view = 'month'
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
          onOpenVisit={open}
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
    const second = [...mocks.actions].find(([key]) => key.includes('Cristales'))
    expect(second).toBeDefined()
    second?.[1]()
    expect(open).toHaveBeenCalledWith('2026-11-13', 'contract', 'two')
    expect(mocks.selectedId).toBeNull()
  })
})
