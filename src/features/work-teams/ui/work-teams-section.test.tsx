import type * as ReactQuery from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkTeamsSection } from './work-teams-section'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: mocks.query,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
  }: {
    children: ReactNode
    to: string
    search: Record<string, string>
  }) => <a href={`${to}?${new URLSearchParams(search)}`}>{children}</a>,
}))

const people = ['Ana', 'Bea', 'Carlos', 'Diana'].map((label) => ({
  id: label.toLowerCase(),
  label,
}))
const north = {
  id: 'north',
  name: 'Norte',
  description: 'Mantenimiento',
  archived: false,
  memberIds: people.map(({ id }) => id),
}
const south = { ...north, id: 'south', name: 'Sur', archived: true }

describe('WorkTeamsSection', () => {
  beforeEach(() => {
    mocks.query.mockReturnValue({ isSuccess: true, data: [north, south] })
  })

  it('links to a team and summarizes its members while hiding archived teams by default', () => {
    const html = renderToStaticMarkup(<WorkTeamsSection tenantId="company" people={people} />)
    expect(html).toMatch(/<h2[^>]*>Equipos de trabajo<\/h2>/)
    expect(html).toContain('Crear equipo')
    expect(html).toContain('Buscar equipos')
    expect(html).toContain('Incluir archivados')
    expect(html).toContain('href="/trabajadores?equipo=north"')
    expect(html).not.toContain('href="/trabajadores?equipo=south"')
    expect(html).toContain('aria-label="Editar Norte"')
    expect(html).toContain('Mantenimiento')
    expect(html).toContain('4 integrantes')
    expect(html).toContain('>Ana<')
    expect(html).toContain('+1 más')
    expect(html).not.toContain('>Diana<')
  })

  it('offers a shortcut to the archived teams when none are active', () => {
    mocks.query.mockReturnValue({ isSuccess: true, data: [south] })
    const html = renderToStaticMarkup(<WorkTeamsSection tenantId="company" people={people} />)
    expect(html).toContain('Solo hay equipos archivados')
    expect(html).toContain('Ver archivados')
    expect(html).not.toContain('href="/trabajadores?equipo=south"')
  })

  it('directs users to Personas if they need to add someone before creating a team', () => {
    mocks.query.mockReturnValue({ isSuccess: true, data: [] })
    const html = renderToStaticMarkup(<WorkTeamsSection tenantId="company" people={[]} />)
    expect(html).toContain('Añade personas a la empresa antes de crear un equipo.')
    expect(html).toContain('href="/trabajadores?vista=personas">Ir a Personas</a>')
    expect(html).not.toContain('Crear equipo')
  })
})
