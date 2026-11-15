import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServiceLocation } from '@/features/clients/domain/client-location'

import type { ServiceContract } from '../application/contract-actions'

const mocks = vi.hoisted(() => ({
  passport: {} as Record<string, unknown>,
}))
vi.mock('@tanstack/react-query', () => ({
  queryOptions: (options: unknown) => options,
  useQuery: () => mocks.passport,
}))

import { ContractLocations, locationMapLinks } from './contract-locations'

const contract = {
  id: 'contract',
  tenant_id: 'tenant',
  client_id: 'client',
  location_id: 'one',
} as ServiceContract
const one = {
  id: 'one',
  name: 'Oficina',
  address: 'Calle Uno',
  city: 'Madrid',
  postal_code: '28001',
  latitude: 40.4,
  longitude: -3.7,
} as ServiceLocation
const two = { ...one, id: 'two', name: 'Almacén', latitude: null, longitude: null }
describe('contract locations', () => {
  beforeEach(() => {
    mocks.passport = { data: { locations: [one, two] } }
  })

  it('shows only the contract centre', () => {
    const html = renderToStaticMarkup(<ContractLocations contract={contract} />)
    expect(html).toContain('Oficina')
    expect(html).toContain('Calle Uno')
    expect(html).not.toContain('Almacén')
    expect(html).toContain('openstreetmap.org/export/embed.html')
    expect(html).toContain('40.4%2C-3.7')
  })

  it('uses addresses without coordinates and never invents a map marker', () => {
    const html = renderToStaticMarkup(
      <ContractLocations contract={{ ...contract, location_id: 'two' }} />,
    )
    expect(html).not.toContain('<iframe')
    expect(html).toContain('Calle%20Uno%2C%2028001%2C%20Madrid')
    expect(html).toContain('Añade coordenadas válidas')
    expect(locationMapLinks({ ...one, latitude: 95 }).embed).toBeNull()
    expect(locationMapLinks({ ...one, latitude: 0, longitude: 0 }).embed).toContain('marker=0%2C0')
  })

  it('shows loading, errors and inaccessible centres instead of an incorrect empty state', () => {
    mocks.passport = { isPending: true }
    expect(renderToStaticMarkup(<ContractLocations contract={contract} />)).toContain(
      'Cargando centros',
    )
    mocks.passport = { isError: true }
    expect(renderToStaticMarkup(<ContractLocations contract={contract} />)).toContain(
      'No se pudieron cargar',
    )
    mocks.passport = { data: { locations: [two] } }
    expect(renderToStaticMarkup(<ContractLocations contract={contract} />)).toContain(
      'El centro asignado no está disponible',
    )
  })
})
