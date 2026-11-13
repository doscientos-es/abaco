import type * as ReactQuery from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { WorkTeamsSection } from './work-teams-section'

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({
    isSuccess: true,
    data: [{ id: 'north', name: 'Norte', description: '', archived: false, memberIds: ['ana'] }],
  }),
}))

describe('WorkTeamsSection', () => {
  it('shows the controls and team cards without a redundant outer card', () => {
    const html = renderToStaticMarkup(
      <WorkTeamsSection
        tenantId="company"
        people={[{ id: 'ana', label: 'Ana' }]}
        peopleReady
        onOpenTeam={vi.fn()}
      />,
    )
    expect(html).toContain('<section aria-labelledby="work-teams-heading" class="space-y-4">')
    expect(html).toContain('class="sr-only">Equipos de trabajo</h2>')
    expect(html).toContain('Crear equipo')
    expect(html).toContain('Buscar equipo')
    expect(html).toContain('Mostrar archivados')
    expect(html).toContain('Ver equipo')
    expect(html).toContain('Norte')
  })
})
