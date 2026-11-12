import type * as ReactQuery from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as Auth from '@/features/auth'

import { TeamSection } from './team-section'

const { query, functionQuery, scheduleQuery } = vi.hoisted(() => ({
  query: vi.fn(),
  functionQuery: vi.fn(),
  scheduleQuery: vi.fn(),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQuery: (options: { queryKey: string[] }) =>
    options.queryKey[0] === 'staff-functions'
      ? functionQuery()
      : options.queryKey[0] === 'staff-schedules'
        ? scheduleQuery()
        : query(),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/features/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof Auth>()),
  useSession: () => ({ userId: 'me', role: 'admin' }),
}))
vi.mock('@/features/work-teams', () => ({ WorkTeamsSection: () => null }))
vi.mock('../application/team-actions', () => ({
  teamQuery: () => ({ queryKey: ['team'] }),
  inviteMember: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
}))

describe('TeamSection', () => {
  beforeEach(() => {
    query.mockReset()
    functionQuery.mockReturnValue({ isSuccess: true, data: [] })
    scheduleQuery.mockReturnValue({ isSuccess: true, data: [] })
  })

  it('shows people and the invitation button while protecting the current user from editing', () => {
    query.mockReturnValue({
      isSuccess: true,
      data: [
        { userId: 'me', fullName: 'Pol Gubau', email: 'pol@example.com', role: 'admin' },
        { userId: 'ana', fullName: 'Ana García', email: 'ana@example.com', role: 'user' },
      ],
    })
    const html = renderToStaticMarkup(<TeamSection tenantId="company" />)
    expect(html).toContain('2 personas')
    expect(html).toContain('Pol Gubau')
    expect(html).toContain('Administrador')
    expect(html).not.toContain('Quitar a Pol Gubau')
    expect(html).toContain('Quitar a Ana García del equipo')
    expect(html).toContain('sm:flex-nowrap')
    expect(html).toContain('sm:w-auto sm:shrink-0')
    expect(html).toContain('data-variant="destructive"')
    expect(html).toContain('data-size="icon-lg"')
    expect(html).toContain('Invitar usuario')
    expect(html).not.toContain('Nombre (opcional)')
    expect(html).not.toContain('Enviar invitación')
  })

  it('shows multiple assignments and permits editing functions for every person', () => {
    query.mockReturnValue({
      isSuccess: true,
      data: [
        { userId: 'me', fullName: 'Pol', email: 'pol@example.com', role: 'admin' },
        { userId: 'ana', fullName: 'Ana', email: 'ana@example.com', role: 'user' },
      ],
    })
    functionQuery.mockReturnValue({
      isSuccess: true,
      data: [
        { id: 'electric', name: 'Electricidad' },
        { id: 'water', name: 'Fontanería' },
      ],
    })
    scheduleQuery.mockReturnValue({
      isSuccess: true,
      data: [{ userId: 'ana', functionIds: ['electric', 'water'] }],
    })
    const html = renderToStaticMarkup(<TeamSection tenantId="company" />)
    expect(html).toContain('Electricidad · Fontanería')
    expect(html).toContain('Editar funciones de Ana')
    expect(html).toContain('Editar funciones de Pol')
    expect(html).toContain('Sin funciones asignadas')
  })

  it('does not allow editing if functions or schedules could not load', () => {
    query.mockReturnValue({
      isSuccess: true,
      data: [{ userId: 'ana', fullName: 'Ana', email: 'ana@example.com', role: 'user' }],
    })
    scheduleQuery.mockReturnValue({ isError: true })
    const html = renderToStaticMarkup(<TeamSection tenantId="company" />)
    expect(html).toContain('No se pudieron cargar las funciones del equipo')
    expect(html).toMatch(
      /disabled=""[^>]*aria-label="Editar funciones de Ana"|aria-label="Editar funciones de Ana"[^>]*disabled=""/,
    )
  })

  it('distinguishes loading, errors and an empty team', () => {
    query.mockReturnValue({ isPending: true })
    expect(renderToStaticMarkup(<TeamSection tenantId="company" />)).toContain('Cargando personas')
    query.mockReturnValue({ isError: true })
    const error = renderToStaticMarkup(<TeamSection tenantId="company" />)
    expect(error).toContain('No se pudo cargar el equipo')
    expect(error).not.toContain('Todavía no hay personas')
    query.mockReturnValue({ isSuccess: true, data: [] })
    expect(renderToStaticMarkup(<TeamSection tenantId="company" />)).toContain(
      'Todavía no hay personas en el equipo',
    )
  })
})
