import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { IncidentPanel } from './incident-panel'

vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  toast: {},
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === 'incidents' ? { incidents: [], count: 0, pageSize: 20 } : [],
  }),
}))
vi.mock('@/features/auth', () => ({ useSession: () => ({ role: 'admin' }), can: () => true }))
vi.mock('../application/incident-actions', () => ({
  createIncident: vi.fn(),
  listIncidentAssignees: vi.fn(),
  listIncidents: vi.fn(),
}))
vi.mock('./incident-card', () => ({ IncidentCard: () => null }))

describe('client incident targets', () => {
  it('offers service centres and a responsible person, without installed equipment or assets', () => {
    const html = renderToStaticMarkup(
      <IncidentPanel
        tenantId="tenant"
        userId="user"
        clientId="client"
        passport={{
          contacts: [],
          locations: [
            {
              id: 'centre',
              name: 'Office centre',
              kind: 'service',
              address: '',
              city: '',
              postal_code: '',
              opening_hours: '',
              operational_contact: '',
              access_notes: '',
              notes: '',
              active: true,
              updated_at: 'version',
            },
          ],
        }}
      />,
    )
    expect(html).toContain('Centro')
    expect(html).toContain('Office centre')
    expect(html).toContain('Responsable')
    expect(html).not.toMatch(/activo|piscina|Sin equipo|Garantía registrada/i)
  })
})
