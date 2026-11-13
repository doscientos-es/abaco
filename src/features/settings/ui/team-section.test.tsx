import type * as ReactQuery from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as Auth from '@/features/auth'

import { TeamSection } from './team-section'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
  }: {
    children: React.ReactNode
    to: string
    search?: Record<string, string>
  }) => <a href={`${to}${search ? `?${new URLSearchParams(search)}` : ''}`}>{children}</a>,
}))

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

  it('shows navigable person cards without exposing management actions in the directory', () => {
    query.mockReturnValue({
      isSuccess: true,
      data: [
        { userId: 'me', fullName: 'Pol Gubau', email: 'pol@example.com', role: 'admin' },
        { userId: 'ana', fullName: 'Ana García', email: 'ana@example.com', role: 'user' },
      ],
    })
    const html = renderToStaticMarkup(<TeamSection tenantId="company" />)
    expect(html).toContain('<section aria-labelledby="people-heading" class="space-y-4">')
    expect(html).toContain('<h2 id="people-heading" class="sr-only">Personas</h2>')
    expect(html).toContain('Buscar personas')
    expect(html).toContain('2 personas')
    expect(html).toContain('Pol Gubau')
    expect(html).toContain('<span class="sr-only">Administrador</span>')
    expect(html).toContain('title="Administrador"')
    expect(html).not.toContain('>Usuario</span>')
    expect(html.match(/title="Administrador"/g)).toHaveLength(1)
    expect(html).toContain('/trabajadores?persona=ana')
    expect(html).toContain('/trabajadores?persona=me')
    expect(html).toContain('Ver ficha')
    expect(html).not.toContain('Quitar acceso')
    expect(html).not.toContain('Editar funciones')
    expect(html).not.toContain('Invitar personas')
    expect(html).not.toContain('Nombre (opcional)')
    expect(html).not.toContain('Enviar invitación')
  })

  it('keeps invitations in settings without rendering the personnel directory', () => {
    query.mockReturnValue({
      isSuccess: true,
      data: [{ userId: 'ana', fullName: 'Ana', email: 'ana@example.com', role: 'user' }],
    })
    const html = renderToStaticMarkup(<TeamSection tenantId="company" mode="invite" />)
    expect(html).toContain('border-border bg-card rounded-lg border')
    expect(html).toContain('Invitar usuario')
    expect(html).toContain('Importar personas')
    expect(html).toContain('Ir a Trabajadores')
    expect(html).not.toContain('ana@example.com')
    expect(html).not.toContain('Editar funciones')
  })

  it('limits personnel management to the requested team or person', () => {
    query.mockReturnValue({
      isSuccess: true,
      data: [
        { userId: 'ana', fullName: 'Ana', email: 'ana@example.com', role: 'user' },
        { userId: 'bea', fullName: 'Bea', email: 'bea@example.com', role: 'user' },
      ],
    })
    const html = renderToStaticMarkup(<TeamSection tenantId="company" memberIds={['ana']} />)
    expect(html).toContain('ana@example.com')
    expect(html).not.toContain('bea@example.com')
  })

  it('shows assignments on cards and provides management actions only in the selected profile', () => {
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
    expect(html).toContain('Sin funciones asignadas')
    const profile = renderToStaticMarkup(<TeamSection tenantId="company" personId="ana" />)
    expect(profile).toContain('Electricidad · Fontanería')
    expect(profile).toContain('Editar funciones de Ana')
    expect(profile).toContain('Rol en la empresa')
    expect(profile).toContain('Quitar a Ana del equipo')
    expect(profile).not.toContain('pol@example.com')
    expect(profile).not.toContain('Buscar personas')
    const ownProfile = renderToStaticMarkup(<TeamSection tenantId="company" personId="me" />)
    expect(ownProfile).toContain('Editar funciones de Pol')
    expect(ownProfile).not.toContain('Quitar acceso')
    expect(ownProfile).not.toContain('Rol en la empresa')
  })

  it('does not allow editing if functions or schedules could not load', () => {
    query.mockReturnValue({
      isSuccess: true,
      data: [{ userId: 'ana', fullName: 'Ana', email: 'ana@example.com', role: 'user' }],
    })
    scheduleQuery.mockReturnValue({ isError: true })
    const html = renderToStaticMarkup(<TeamSection tenantId="company" personId="ana" />)
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
