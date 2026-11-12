import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientPassportPage } from './client-passport-page'

const mocks = vi.hoisted(() => ({
  allowed: true,
  start: vi.fn(),
  actions: new Map<string, () => void>(),
}))
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: () => [null, mocks.start],
}))
vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>
  return {
    Button: ({ children, onPress }: { children: string; onPress: () => void }) => {
      mocks.actions.set(children, onPress)
      return <button>{children}</button>
    },
    IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
      mocks.actions.set(label, onPress)
      return <button aria-label={label} />
    },
    Card: Container,
    CardContent: Container,
    CardHeader: Container,
    CardTitle: Container,
    PageHeader: Container,
    PageHeaderActions: Container,
    PageHeaderDescription: Container,
    PageHeaderHeading: Container,
    PageHeaderTitle: Container,
  }
})
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({
    data: {
      contacts: [{ id: 'contact', name: 'Ana', active: true, role: 'other' }],
      locations: [
        {
          id: 'centre',
          name: 'Office centre',
          active: true,
          address: 'Test address',
          operational_contact: 'Reception',
          access_notes: 'Call ahead',
          notes: 'Cleaning notes',
        },
      ],
      assets: [{ id: 'old', location_id: 'centre', name: 'Legacy pool TEST' }],
    },
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/clientes">{children}</a>,
}))
vi.mock('@/features/auth', () => ({
  useSession: () => ({ role: 'admin', userId: 'user' }),
  can: () => mocks.allowed,
}))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({
    tenant: { id: 'tenant' },
    clients: [{ id: 'client', name: 'Client TEST' }],
  }),
}))
vi.mock('@/features/incidents/ui/incident-panel', () => ({
  IncidentPanel: () => <div>Incidencias del cliente</div>,
}))
vi.mock('@/features/visits/ui/client-visit-history', () => ({
  ClientVisitHistory: () => <div>Historial de visitas</div>,
}))
vi.mock('../application/client-passport-actions', () => ({ loadClientPassport: vi.fn() }))
vi.mock('./client-passport-dialog', () => ({ CreatePassportItem: () => null, contactRoles: [] }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.actions.clear()
  mocks.allowed = true
})

describe('client service centres', () => {
  it('shows centre details and history without reviving legacy assets', () => {
    const html = renderToStaticMarkup(<ClientPassportPage clientId="client" />)
    expect(html).toContain('Centros de trabajo')
    expect(html).toContain('Office centre')
    expect(html).toContain('Reception')
    expect(html).toContain('Call ahead')
    expect(html).toContain('Historial de visitas')
    expect(html).not.toMatch(/piscina|activos|instalaciones|Legacy pool/i)
    mocks.actions.get('Añadir centro')?.()
    expect(mocks.start).toHaveBeenCalledWith({ kind: 'location' })
    expect(html).toContain('aria-label="Editar centro Office centre"')
    mocks.actions.get('Editar centro Office centre')?.()
    expect(mocks.start).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'editLocation' }))
    expect(html).toContain('aria-label="Editar contacto Ana"')
    mocks.actions.get('Editar contacto Ana')?.()
    expect(mocks.start).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'editContact' }))
  })

  it('does not offer centre creation or editing to a read-only user', () => {
    mocks.allowed = false
    renderToStaticMarkup(<ClientPassportPage clientId="client" />)
    expect(mocks.actions.has('Añadir centro')).toBe(false)
    expect(mocks.actions.has('Editar centro Office centre')).toBe(false)
    expect(mocks.actions.has('Editar contacto Ana')).toBe(false)
  })
})
