import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientPassportPage } from './client-passport-page'

const mocks = vi.hoisted(() => ({
  allowed: true,
  clientPhone: '612 345 678',
  contactIsActive: true,
  contactPhone: '+44 20 7946 0958',
  address: 'Calle Ávila 4',
  latitude: null as number | null,
  longitude: null as number | null,
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
      contacts: [
        {
          id: 'contact',
          name: 'Ana',
          active: mocks.contactIsActive,
          role: 'other',
          phone: mocks.contactPhone,
        },
      ],
      locations: [
        {
          id: 'centre',
          name: 'Office centre',
          active: true,
          address: mocks.address,
          postal_code: '05001',
          city: 'Ávila',
          latitude: mocks.latitude,
          longitude: mocks.longitude,
          opening_hours: 'Lunes a viernes, 8:00–18:00',
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
    estimates: [],
    invoices: [],
    clients: [
      {
        id: 'client',
        name: 'Client TEST',
        email: 'cliente@example.test',
        phone: mocks.clientPhone,
      },
    ],
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
  mocks.contactIsActive = true
  mocks.clientPhone = '612 345 678'
  mocks.contactPhone = '+44 20 7946 0958'
  mocks.address = 'Calle Ávila 4'
  mocks.latitude = null
  mocks.longitude = null
})

describe('client service centres', () => {
  it('shows centre details and history without reviving legacy assets', () => {
    const html = renderToStaticMarkup(<ClientPassportPage clientId="client" />)
    expect(html).toContain('Centros de trabajo')
    expect(html).toContain('Office centre')
    expect(html).toContain('Horario: Lunes a viernes, 8:00–18:00')
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

  it('offers secure contact and centre links without including private notes', () => {
    const html = renderToStaticMarkup(<ClientPassportPage clientId="client" />)
    expect(html).toContain('tel:+34612345678')
    expect(html).toContain('mailto:cliente@example.test')
    expect(html).toContain('https://wa.me/34612345678?text=')
    expect(html).toContain('https://wa.me/442079460958?text=')
    expect(html).toContain('Podrás revisar y editar el mensaje en WhatsApp antes de enviarlo.')
    expect(html).toContain('Calle Ávila 4 · Ávila')
    expect(html).toContain('destination=Calle+%C3%81vila+4%2C+05001%2C+%C3%81vila')
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(3)
    expect(html).not.toMatch(/href="[^"]*(?:Reception|Cleaning|Call\+ahead)/)
  })

  it('prioritizes centre coordinates without hiding the original address', () => {
    mocks.latitude = 40.656
    mocks.longitude = -4.7
    const html = renderToStaticMarkup(<ClientPassportPage clientId="client" />)
    expect(html).toContain('Calle Ávila 4 · Ávila')
    expect(html).toContain('destination=40.656%2C-4.7')
    expect(html).not.toContain('destination=Calle+')
    expect(html).not.toContain('La dirección puede estar incompleta')
  })

  it('uses coordinates without a street and falls back when coordinates are invalid', () => {
    mocks.address = ''
    mocks.latitude = 0
    mocks.longitude = 0
    let html = renderToStaticMarkup(<ClientPassportPage clientId="client" />)
    expect(html).toContain('destination=0%2C0')
    expect(html).toContain(' · Ávila')
    expect(html).not.toContain('Sin dirección de visita.')

    mocks.address = 'Calle Ávila 4'
    mocks.latitude = 91
    html = renderToStaticMarkup(<ClientPassportPage clientId="client" />)
    expect(html).toContain('destination=Calle+%C3%81vila+4%2C+05001%2C+%C3%81vila')
    expect(html).not.toContain('destination=91')
  })

  it('does not offer links without a valid phone or a street address', () => {
    mocks.clientPhone = ''
    mocks.contactPhone = '612345678 ext 9'
    mocks.address = '  '
    const html = renderToStaticMarkup(<ClientPassportPage clientId="client" />)
    expect(html).toContain('WhatsApp no disponible: sin teléfono.')
    expect(html).toContain('WhatsApp no disponible: revisa el teléfono')
    expect(html).toContain('Sin dirección de visita.')
    expect(html).toContain(' · Ávila')
    expect(html).not.toContain('https://wa.me/')
    expect(html).not.toContain('https://www.google.com/maps/')
  })

  it('shows a real empty state when existing contacts are inactive', () => {
    mocks.contactIsActive = false
    const html = renderToStaticMarkup(<ClientPassportPage clientId="client" />)
    expect(html).toContain('Aún no hay contactos adicionales.')
    expect(html).not.toContain('Abrir WhatsApp de Ana')
  })

  it('does not offer centre creation or editing to a read-only user', () => {
    mocks.allowed = false
    renderToStaticMarkup(<ClientPassportPage clientId="client" />)
    expect(mocks.actions.has('Añadir centro')).toBe(false)
    expect(mocks.actions.has('Editar centro Office centre')).toBe(false)
    expect(mocks.actions.has('Editar contacto Ana')).toBe(false)
  })
})
