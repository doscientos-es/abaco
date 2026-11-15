import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { VacationCoverage } from './vacation-coverage'

const mocks = vi.hoisted(() => ({ visits: [] as Array<Record<string, unknown>> }))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: mocks.visits }),
  useMutation: () => ({ isPending: false }),
}))

describe('vacation coverage', () => {
  it('shows team visits without offering a misleading single-person replacement', () => {
    mocks.visits = [
      {
        visitId: 'visit',
        title: 'Limpieza',
        clientName: 'Cliente',
        locationName: '',
        timezone: 'Europe/Madrid',
        assignedUserId: null,
        assignedUserName: '',
        scheduledStartAt: '2040-06-12T08:00:00Z',
        scheduledEndAt: '2040-06-12T09:00:00Z',
        status: 'scheduled',
        updatedAt: 'version',
        workTeamName: 'Equipo',
        candidates: [],
      },
    ]
    const html = renderToStaticMarkup(
      <VacationCoverage tenantId="tenant" requestId="request" approved={false} />,
    )
    expect(html).toContain('Equipo Equipo')
    expect(html).toContain('Revisa su cobertura en la agenda')
    expect(html).not.toContain('Asignar y registrar cambio')
  })
})
