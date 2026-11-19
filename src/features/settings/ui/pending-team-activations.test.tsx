import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { PendingTeamActivations } from './pending-team-activations'

const query = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-query', () => ({ useQuery: () => query() }))
vi.mock('../application/team-actions', () => ({
  pendingTeamActivationsQuery: () => ({ queryKey: ['pending-team-activations'] }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, search }: { children: React.ReactNode; search: { persona: string } }) => (
    <a href={`/trabajadores?persona=${search.persona}`}>{children}</a>
  ),
}))

const members = [
  { userId: 'ana', fullName: 'Ana', email: 'ana@example.test', role: 'user' as const },
  { userId: 'bea', fullName: 'Bea', email: 'bea@example.test', role: 'user' as const },
]

describe('pending team activations', () => {
  it('links only pending members to their profiles', () => {
    query.mockReturnValue({ isSuccess: true, data: ['ana'] })
    const html = renderToStaticMarkup(
      <PendingTeamActivations tenantId="company" members={members} />,
    )
    expect(html).toContain('Invitaciones pendientes')
    expect(html).toContain('Ana · ana@example.test')
    expect(html).toContain('/trabajadores?persona=ana')
    expect(html).not.toContain('bea@example.test')
  })

  it('distinguishes loading, failure and an empty list', () => {
    query.mockReturnValue({ isPending: true })
    expect(
      renderToStaticMarkup(<PendingTeamActivations tenantId="company" members={members} />),
    ).toContain('Cargando invitaciones')
    query.mockReturnValue({ isError: true })
    expect(
      renderToStaticMarkup(<PendingTeamActivations tenantId="company" members={members} />),
    ).toContain('No se pudieron cargar')
    query.mockReturnValue({ isSuccess: true, data: [] })
    expect(
      renderToStaticMarkup(<PendingTeamActivations tenantId="company" members={members} />),
    ).toContain('No hay cuentas pendientes')
  })
})
