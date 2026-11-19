import type * as UI from '@doscientos/ui'
import type * as ReactQuery from '@tanstack/react-query'
import type * as React from 'react'
import { isValidElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CalendarEvent } from '@/shared/lib/event-calendar'

import type { StaffPerson } from '../domain/staff-schedule'
import type { StaffSelection, StaffTeam } from '../domain/staff-selection'
import { StaffSchedulesPage } from './staff-schedules-page'

type FilterProps = {
  people: StaffPerson[]
  teams: StaffTeam[]
  selected: StaffSelection
  onChange: (selection: StaffSelection) => void
}
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  session: vi.fn(),
  selected: undefined as StaffSelection | undefined,
  filter: null as FilterProps | null,
  popover: null as { open: boolean | undefined; placement: string | undefined } | null,
  events: [] as CalendarEvent[],
  click: undefined as ((item: CalendarEvent) => void) | undefined,
  stateIndex: 0,
  editorId: null as string | null,
  itemId: null as string | null,
}))
vi.mock('react', async (original) => {
  const actual = await original<typeof React>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const state = actual.useState(initial)
      const index = mocks.stateIndex++
      if (index === 4) return [mocks.editorId, (id: string | null) => (mocks.editorId = id)]
      if (index === 5) return [mocks.itemId, (id: string | null) => (mocks.itemId = id)]
      return initial === undefined
        ? [
            mocks.selected,
            (value: StaffSelection) => {
              mocks.selected = value
            },
          ]
        : state
    },
  }
})
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof ReactQuery>()),
  useQuery: mocks.query,
}))
vi.mock('@doscientos/ui', async (original) => {
  const actual = await original<typeof UI>()
  return {
    ...actual,
    Popover: (props: React.ComponentProps<typeof actual.Popover>) => {
      if (
        'trigger' in props &&
        isValidElement<FilterProps>(props.children) &&
        Array.isArray(props.children.props.people) &&
        Array.isArray(props.children.props.teams)
      ) {
        mocks.filter = props.children.props
        mocks.popover = { open: props.isOpen, placement: props.placement }
      }
      return <actual.Popover {...props} />
    },
  }
})
vi.mock('@/features/auth', () => ({ useSession: mocks.session }))
vi.mock('@/features/settings/application/team-actions', () => ({
  teamQuery: () => ({ queryKey: ['team', 'company'] }),
}))
vi.mock('@/features/work-teams', () => ({
  workTeamsQuery: () => ({ queryKey: ['work-teams', 'company'] }),
}))
vi.mock('./staff-people-filter', () => ({
  StaffPeopleFilter: (props: FilterProps) => {
    mocks.filter = props
    return <p>Buscar personas o equipos</p>
  },
}))
vi.mock('@/shared/ui/event-calendar', () => ({
  EventCalendar: ({
    items,
    onItemClick,
  }: {
    items: CalendarEvent[]
    onItemClick: (item: CalendarEvent) => void
  }) => {
    mocks.events = items
    mocks.click = onItemClick
    return (
      <div>
        {items.map((item) => (
          <span key={item.id}>{item.title}</span>
        ))}
      </div>
    )
  },
}))
vi.mock('./staff-schedule-editor', () => ({
  StaffScheduleEditor: ({ person }: { person: StaffPerson }) => (
    <p>Editar horario de {person.name}</p>
  ),
}))
vi.mock('@/shared/ui/calendar-details-dialog', () => ({
  CalendarDetailsDialog: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <dialog open aria-label={title}>
      {children}
    </dialog>
  ),
}))

describe('staff schedule access and availability', () => {
  beforeEach(() => {
    mocks.selected = undefined
    mocks.filter = null
    mocks.popover = null
    mocks.events = []
    mocks.click = undefined
    mocks.stateIndex = 0
    mocks.editorId = null
    mocks.itemId = null
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 16, 12))
    mocks.query.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      const data: Record<string, unknown> = {
        team: [
          { userId: 'ana', fullName: 'Ana', email: 'ana@example.com' },
          { userId: 'luis', fullName: 'Luis', email: 'luis@example.com' },
        ],
        'staff-functions': [{ id: 'electricidad', name: 'Electricidad' }],
        'staff-calendar-colors': [{ user_id: 'luis', calendar_color: 'blue' }],
        'work-teams': [
          { id: 'north', name: 'Norte', memberIds: ['ana', 'luis', 'outsider'], archived: false },
          { id: 'old', name: 'Archivado', memberIds: ['ana'], archived: true },
          { id: 'empty', name: 'Vacío', memberIds: [], archived: false },
        ],
        'staff-schedules': ['ana', 'luis'].map((userId) => ({
          userId,
          updatedAt: 'v1',
          functionIds: ['electricidad'],
          slots: [{ weekday: 1, start: 540, end: 1020 }],
        })),
        'staff-absences': [{ userId: 'ana', startDate: '2026-11-16', endDate: '2026-11-16' }],
      }
      return { isPending: false, isError: false, isSuccess: true, data: data[queryKey[0] ?? ''] }
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  function adminSession() {
    mocks.session.mockReturnValue({
      tenantId: 'company',
      userId: 'admin',
      fullName: 'Admin',
      role: 'admin',
    })
  }

  it.each(['admin', 'worker'])('routes a shift click by permission (%s)', (role) => {
    if (role === 'admin') adminSession()
    else
      mocks.session.mockReturnValue({ tenantId: 'company', userId: 'luis', fullName: 'Luis', role })
    const render = () => {
      mocks.stateIndex = 0
      return renderToStaticMarkup(<StaffSchedulesPage />)
    }
    render()
    const item = mocks.events.find((event) => event.title === 'Luis')
    if (!item) throw new Error('Missing staff shift')
    mocks.click?.(item)
    const html = render()
    if (role === 'admin') {
      expect(html).toContain('Editar horario de Luis')
      expect(mocks.itemId).toBeNull()
    } else {
      expect(html).toContain('aria-label="Horario de Luis"')
      expect(html).toContain('09:00–17:00')
      expect(mocks.editorId).toBeNull()
    }
  })

  it('uses the saved color for each person’s calendar events', () => {
    adminSession()
    renderToStaticMarkup(<StaffSchedulesPage />)
    expect(mocks.events.find((event) => event.title === 'Luis')?.color).toBe('blue')
  })

  it('opens small companies with the whole company calendar and search', () => {
    adminSession()
    const html = renderToStaticMarkup(<StaffSchedulesPage />)
    expect(html).toContain('Horarios del equipo')
    expect(html).not.toContain('Semana tipo actual')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Personas y equipos · 2 de 2')
    expect(html).not.toContain('Buscar personas o equipos')
    expect(mocks.popover).toEqual({ open: false, placement: 'bottom start' })
    expect(html).toContain('Filtrar por función')
    expect(html).not.toContain('Previstos ahora:')
    expect(html).not.toContain('>Calendario</h2>')
    expect(html).not.toContain('Selecciona personas o equipos en el buscador')
    expect(html).toContain('Descargar PDF')
    expect(html).toContain('aria-label="Descargar PDF"')
    expect(mocks.events).toHaveLength(1)
    expect(mocks.filter?.selected.personIds).toEqual(['ana', 'luis'])
    expect(mocks.filter?.teams).toEqual([
      { id: 'north', name: 'Norte', memberIds: ['ana', 'luis'], archived: false },
    ])
  })

  it('shows selected team members once and excludes approved absences', () => {
    adminSession()
    renderToStaticMarkup(<StaffSchedulesPage />)
    mocks.filter?.onChange({ personIds: ['luis'], teamIds: ['north'] })
    const html = renderToStaticMarkup(<StaffSchedulesPage />)
    expect(html).toContain('Personas y equipos · 2 de 2')
    expect(mocks.events).toHaveLength(1)
    expect(mocks.events[0]?.title).toBe('Luis')
    expect(html).not.toMatch(/<div><span[^>]*>Ana<\/span>/)
    expect(html).toContain('Descargar PDF')
  })

  it('confines the default calendar, filter and team memberships to a team context', () => {
    adminSession()
    const html = renderToStaticMarkup(
      <StaffSchedulesPage memberIds={['luis']} title="Equipo Sur" embedded />,
    )
    expect(html).toContain('Equipo Sur')
    expect(html).toContain('<h2 class="sr-only">Equipo Sur</h2>')
    expect(html).toContain('Editar horario')
    expect(html).not.toContain('<h1')
    expect(mocks.filter?.people.map((person) => person.userId)).toEqual(['luis'])
    expect(mocks.filter?.teams[0]?.memberIds).toEqual(['luis'])
    expect(mocks.events).toHaveLength(1)
    expect(mocks.events[0]?.title).toBe('Luis')
  })

  it('never broadens an empty team to the company calendar', () => {
    adminSession()
    renderToStaticMarkup(<StaffSchedulesPage memberIds={[]} />)
    expect(mocks.filter?.people).toEqual([])
    expect(mocks.events).toEqual([])
  })

  it('keeps 154 employees out of the calendar until a person or team is selected', () => {
    adminSession()
    const originalQuery = mocks.query.getMockImplementation()
    mocks.query.mockImplementation((options: { queryKey: string[] }) =>
      options.queryKey[0] === 'team'
        ? {
            isSuccess: true,
            data: Array.from({ length: 154 }, (_, index) => ({
              userId: index === 153 ? 'luis' : `person-${index}`,
              fullName: `Persona ${index}`,
              email: `person${index}@example.com`,
            })),
          }
        : originalQuery?.(options),
    )
    const html = renderToStaticMarkup(<StaffSchedulesPage />)
    expect(mocks.filter?.people).toHaveLength(154)
    expect(html).toContain('Personas y equipos · 0 de 154')
    expect(html).not.toContain('Descargar PDF')
    expect(mocks.events).toHaveLength(0)
    mocks.filter?.onChange({ personIds: ['luis'], teamIds: [] })
    expect(renderToStaticMarkup(<StaffSchedulesPage />)).toContain('Personas y equipos · 1 de 154')
    expect(mocks.events).toHaveLength(1)
    expect(mocks.events[0]?.title).toBe('Persona 153')
  })

  it('does not request the team or expose another person to a worker', () => {
    mocks.session.mockReturnValue({
      tenantId: 'company',
      userId: 'ana',
      fullName: 'Ana',
      role: 'user',
    })
    const html = renderToStaticMarkup(<StaffSchedulesPage />)
    expect(html).toContain('Mi horario')
    expect(html).toContain('Electricidad')
    expect(html).toMatch(/<button[^>]*aria-label="Descargar PDF"[^>]*disabled/)
    expect(html).not.toContain('Luis')
    expect(
      mocks.query.mock.calls.find(([options]) => options.queryKey[0] === 'team')?.[0].enabled,
    ).toBe(false)
    expect(html).toContain('No hay franjas previstas')
    expect(
      mocks.query.mock.calls.find(([options]) => options.queryKey[0] === 'work-teams')?.[0].enabled,
    ).toBe(false)
  })

  it('shows the administrator only their own schedule in personal mode', () => {
    mocks.session.mockReturnValue({
      tenantId: 'company',
      userId: 'luis',
      fullName: 'Luis',
      role: 'admin',
    })
    const html = renderToStaticMarkup(<StaffSchedulesPage personal />)
    expect(html).toContain('Mi horario')
    expect(html).toContain('Luis')
    expect(html).not.toContain('Ana')
    expect(html).not.toContain('Filtrar por función')
    expect(
      mocks.query.mock.calls.find(([options]) => options.queryKey[0] === 'team')?.[0].enabled,
    ).toBe(false)
  })
})
