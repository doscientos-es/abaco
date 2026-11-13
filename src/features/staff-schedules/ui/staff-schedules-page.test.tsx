import type * as ReactQuery from '@tanstack/react-query'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  events: [] as { id: string; title: string }[],
}))
vi.mock('react', async (original) => {
  const actual = await original<typeof React>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const state = actual.useState(initial)
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
  EventCalendar: ({ items }: { items: { id: string; title: string }[] }) => {
    mocks.events = items
    return (
      <div>
        {items.map((item) => (
          <span key={item.id}>{item.title}</span>
        ))}
      </div>
    )
  },
}))

describe('staff schedule access and availability', () => {
  beforeEach(() => {
    mocks.selected = undefined
    mocks.filter = null
    mocks.events = []
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 16, 12))
    mocks.query.mockImplementation(({ queryKey }: { queryKey: string[] }) => {
      const data: Record<string, unknown> = {
        team: [
          { userId: 'ana', fullName: 'Ana', email: 'ana@example.com' },
          { userId: 'luis', fullName: 'Luis', email: 'luis@example.com' },
        ],
        'staff-functions': [{ id: 'electricidad', name: 'Electricidad' }],
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

  it('opens small companies with the whole company calendar and search', () => {
    adminSession()
    const html = renderToStaticMarkup(<StaffSchedulesPage />)
    expect(html).toContain('Horarios del equipo')
    expect(html).toContain('Buscar personas o equipos')
    expect(html).toContain('Filtrar por función')
    expect(html).not.toContain('Selecciona personas o equipos en el buscador')
    expect(html).toContain('Descargar PDF')
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
    expect(html).toMatch(/Previstos ahora:<\/strong>\s*Luis/)
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
    renderToStaticMarkup(<StaffSchedulesPage />)
    expect(mocks.filter?.people).toHaveLength(154)
    expect(mocks.events).toHaveLength(0)
    mocks.filter?.onChange({ personIds: ['luis'], teamIds: [] })
    renderToStaticMarkup(<StaffSchedulesPage />)
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
    expect(html).not.toContain('Luis')
    expect(
      mocks.query.mock.calls.find(([options]) => options.queryKey[0] === 'team')?.[0].enabled,
    ).toBe(false)
    expect(html).toContain('No hay franjas previstas')
    expect(
      mocks.query.mock.calls.find(([options]) => options.queryKey[0] === 'work-teams')?.[0].enabled,
    ).toBe(false)
  })
})
