import type * as React from 'react'
import { Children, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServiceLocation } from '@/features/clients/domain/client-location'

import type { CleaningService } from '../application/cleaning-service-actions'
import type { ServiceContract } from '../application/contract-actions'

const mocks = vi.hoisted(() => ({
  jobs: {} as Record<string, unknown>,
  passport: {} as Record<string, unknown>,
  selected: null as string | null,
}))
vi.mock('@tanstack/react-query', () => ({
  queryOptions: (options: unknown) => options,
  useQuery: (options: { queryKey: string[] }) =>
    options.queryKey[0] === 'cleaning-services' ? mocks.jobs : mocks.passport,
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: () => [
    mocks.selected,
    (value: string) => {
      mocks.selected = value
    },
  ],
}))

import { contractLocationIds, ContractLocations, locationMapLinks } from './contract-locations'

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
const jobs = [
  { location_id: 'one' },
  { location_id: 'two' },
  { location_id: null },
] as CleaningService[]

function findButton(node: ReactNode, label: string): (() => void) | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) continue
    if (child.type === 'button' && child.props.children === label) return child.props.onClick
    const nested = findButton(child.props.children, label)
    if (nested) return nested
  }
  return undefined
}

describe('contract locations', () => {
  beforeEach(() => {
    mocks.jobs = { data: jobs }
    mocks.passport = { data: { locations: [one, two] } }
    mocks.selected = null
  })

  it('deduplicates the contract centre and every job centre, including inactive centres', () => {
    expect(contractLocationIds(contract, jobs)).toEqual(['one', 'two'])
    const html = renderToStaticMarkup(<ContractLocations contract={contract} />)
    expect(html).toContain('Oficina')
    expect(html).toContain('Calle Uno')
    expect(html).toContain('Almacén')
    expect(html).toContain('openstreetmap.org/export/embed.html')
    expect(html).toContain('40.4%2C-3.7')
  })

  it('uses addresses without coordinates and never invents a map marker', () => {
    findButton(ContractLocations({ contract }), 'Almacén')?.()
    expect(mocks.selected).toBe('two')
    const html = renderToStaticMarkup(<ContractLocations contract={contract} />)
    expect(html).not.toContain('<iframe')
    expect(html).toContain('Calle%20Uno%2C%2028001%2C%20Madrid')
    expect(html).toContain('Añade coordenadas válidas')
    expect(locationMapLinks({ ...one, latitude: 95 }).embed).toBeNull()
    expect(locationMapLinks({ ...one, latitude: 0, longitude: 0 }).embed).toContain('marker=0%2C0')
  })

  it('shows loading, errors and inaccessible centres instead of an incorrect empty state', () => {
    mocks.jobs = { isPending: true }
    expect(renderToStaticMarkup(<ContractLocations contract={contract} />)).toContain(
      'Cargando centros',
    )
    mocks.jobs = { isError: true }
    expect(renderToStaticMarkup(<ContractLocations contract={contract} />)).toContain(
      'No se pudieron cargar',
    )
    mocks.jobs = { data: jobs }
    mocks.passport = { data: { locations: [one] } }
    expect(renderToStaticMarkup(<ContractLocations contract={contract} />)).toContain(
      'Algunos centros asignados no están disponibles',
    )
  })
})
