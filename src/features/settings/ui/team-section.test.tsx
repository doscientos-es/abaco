import type * as ReactQuery from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as Auth from '@/features/auth'

import { TeamSection } from './team-section'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQuery: query,
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
  beforeEach(() => query.mockReset())

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
