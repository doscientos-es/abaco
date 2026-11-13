import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkersSearch } from '../domain/worker-navigation'
import { WorkersPage } from './workers-page'

const mocks = vi.hoisted(() => ({
  search: {} as WorkersSearch,
  navigate: vi.fn(),
  schedule: vi.fn(),
  vacations: vi.fn(),
  directory: vi.fn(),
  teams: vi.fn(),
  data: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mocks.search,
  useNavigate: () => mocks.navigate,
  Link: ({
    children,
    to,
    search,
    ...props
  }: {
    children: ReactNode
    to: string
    search?: WorkersSearch
  }) => (
    <a {...props} href={`${to}${search ? `?${new URLSearchParams(search).toString()}` : ''}`}>
      {children}
    </a>
  ),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/features/auth', () => ({ useSession: () => ({ tenantId: 'company' }) }))
vi.mock('../application/use-workers-data', () => ({ useWorkersData: mocks.data }))
vi.mock('@/features/settings/ui/team-section', () => ({ TeamSection: mocks.directory }))
vi.mock('@/features/staff-schedules', () => ({
  StaffSchedulesPage: mocks.schedule,
  StaffFunctionsSection: () => <p>Funciones</p>,
}))
vi.mock('./worker-vacations', () => ({ WorkerVacations: mocks.vacations }))
vi.mock('@/features/work-teams', () => ({
  WorkTeamForm: () => null,
  WorkTeamsSection: mocks.teams,
  workTeamsQuery: () => ({ queryKey: ['work-teams'] }),
}))

describe('workers module navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.search = {}
    mocks.data.mockReturnValue({
      pending: false,
      failed: false,
      people: [
        { userId: 'ana', fullName: 'Ana', email: 'ana@example.com', role: 'user' },
        { userId: 'bea', fullName: 'Bea', email: 'bea@example.com', role: 'user' },
      ],
      teams: [
        { id: 'north', name: 'Equipo Norte', description: '', memberIds: ['ana'], archived: false },
      ],
    })
    for (const component of [mocks.directory, mocks.schedule, mocks.vacations, mocks.teams])
      component.mockReturnValue(null)
  })

  it('provides a company directory and dedicated navigable sections', () => {
    const html = renderToStaticMarkup(<WorkersPage />)
    expect(html).toMatch(/<h1[^>]*>Trabajadores<\/h1>/)
    expect(html).not.toContain('Las personas de tu empresa, sus equipos y su disponibilidad')
    expect(html).not.toContain('Equipos activos')
    expect(html).not.toContain('Sin equipo')
    expect(html).not.toContain('<strong')
    for (const view of ['equipos', 'horarios', 'vacaciones', 'organigrama', 'funciones'])
      expect(html).toContain(`vista=${view}`)
    expect(mocks.directory.mock.calls[0]?.[0].memberIds).toBeUndefined()
  })

  it('opens a team through real router navigation', () => {
    mocks.search = { vista: 'equipos' }
    renderToStaticMarkup(<WorkersPage />)
    mocks.teams.mock.calls[0]?.[0].onOpenTeam('north')
    expect(mocks.navigate).toHaveBeenCalledWith({ search: { equipo: 'north' } })
  })

  it.each(['horarios', 'vacaciones'] as const)(
    'keeps team context in %s and its tab links',
    (vista) => {
      mocks.search = { vista, equipo: 'north' }
      const html = renderToStaticMarkup(<WorkersPage />)
      const child = vista === 'horarios' ? mocks.schedule : mocks.vacations
      expect(child.mock.calls[0]?.[0].memberIds).toEqual(['ana'])
      expect(html).toContain('Equipo Norte')
      expect(html).toContain('equipo=north')
      expect(html).not.toContain('vista=organigrama')
    },
  )

  it('opens individual schedules and links back to their real teams', () => {
    mocks.search = { vista: 'horarios', persona: 'ana' }
    const html = renderToStaticMarkup(<WorkersPage />)
    expect(mocks.schedule.mock.calls[0]?.[0].memberIds).toEqual(['ana'])
    expect(html).toContain('equipo=north')
    expect(html).toContain('ana@example.com')
  })

  it.each(['', 'Personal de la zona norte'])(
    'preserves only user-defined team descriptions: %s',
    (description) => {
      mocks.search = { equipo: 'north' }
      mocks.data.mockReturnValue({
        ...mocks.data(),
        teams: [
          { id: 'north', name: 'Equipo Norte', description, memberIds: ['ana'], archived: false },
        ],
      })
      const html = renderToStaticMarkup(<WorkersPage />)
      expect(html).not.toContain('Personas, horarios y ausencias de este equipo.')
      if (description) expect(html).toContain(description)
      else expect(html).not.toContain('<p')
    },
  )

  it('shows not-found for a stale team without exposing the whole directory', () => {
    mocks.search = { equipo: 'deleted' }
    const html = renderToStaticMarkup(<WorkersPage />)
    expect(html).toContain('No se encontró esta ficha')
    expect(mocks.directory).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it('shows loading and retry states without rendering incomplete data', () => {
    mocks.data.mockReturnValue({ pending: true, people: [], teams: [] })
    expect(renderToStaticMarkup(<WorkersPage />)).toContain('Cargando trabajadores')
    mocks.data.mockReturnValue({ failed: true, people: [], teams: [] })
    expect(renderToStaticMarkup(<WorkersPage />)).toContain('Reintentar')
    expect(mocks.directory).not.toHaveBeenCalled()
  })
})
