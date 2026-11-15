import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as Geocoding from '../application/location-geocoding'

const mocks = vi.hoisted(() => ({
  state: undefined as unknown,
  buttons: new Map<string, { onPress: () => void; disabled: boolean }>(),
  search: vi.fn(),
  select: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: (initial: unknown) => {
    if (mocks.state === undefined) mocks.state = initial
    return [
      mocks.state,
      (next: unknown) => {
        mocks.state = next
      },
    ]
  },
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({
    children,
    onPress,
    isDisabled = false,
  }: {
    children: ReactNode
    onPress: () => void
    isDisabled?: boolean
  }) => {
    const label =
      typeof children === 'string' ? children : Array.isArray(children) ? children[0] : ''
    if (typeof label === 'string') mocks.buttons.set(label, { onPress, disabled: isDisabled })
    return <button disabled={isDisabled}>{children}</button>
  },
}))
vi.mock('../application/location-geocoding', async (importOriginal) => ({
  ...(await importOriginal<typeof Geocoding>()),
  searchLocationAddress: mocks.search,
}))

import { LocationCoordinateSearch } from './location-coordinate-search'

const address = { address: 'Calle A 1', city: 'Melilla', postal_code: '52001' }
function render(value = address) {
  mocks.buttons.clear()
  return renderToStaticMarkup(<LocationCoordinateSearch address={value} onSelect={mocks.select} />)
}

beforeEach(() => {
  mocks.state = undefined
  vi.clearAllMocks()
})

describe('centre coordinate search', () => {
  it('requires an address and never searches automatically', () => {
    const html = render({ ...address, address: '' })
    expect(mocks.buttons.get('Buscar coordenadas')?.disabled).toBe(true)
    expect(html).not.toContain('Abrir dirección en Google Maps')
    expect(mocks.search).not.toHaveBeenCalled()
  })

  it('lets the user choose a match without overwriting coordinates prematurely', async () => {
    mocks.search.mockResolvedValue([{ label: 'Calle A 1, Melilla', coordinates: '35.2, -2.9' }])
    expect(render()).toContain('Abrir dirección en Google Maps')
    mocks.buttons.get('Buscar coordenadas')?.onPress()
    expect(render()).toContain('Buscando…')
    await vi.waitFor(() => expect(render()).toContain('Selecciona la dirección correcta'))
    expect(mocks.search).toHaveBeenCalledWith('Calle A 1, 52001, Melilla')
    expect(mocks.select).not.toHaveBeenCalled()
    mocks.buttons.get('Calle A 1, Melilla')?.onPress()
    expect(mocks.select).toHaveBeenCalledWith('35.2, -2.9')
    expect(render()).not.toContain('Selecciona la dirección correcta')
  })

  it('hides outdated results after an address change and offers a fallback on errors', async () => {
    mocks.search
      .mockResolvedValueOnce([{ label: 'Anterior', coordinates: '35, -2' }])
      .mockRejectedValueOnce(new Error('offline'))
    render()
    mocks.buttons.get('Buscar coordenadas')?.onPress()
    await vi.waitFor(() => expect(render()).toContain('Anterior'))
    expect(render({ ...address, address: 'Calle B' })).not.toContain('Anterior')
    mocks.buttons.get('Buscar coordenadas')?.onPress()
    await vi.waitFor(() =>
      expect(render({ ...address, address: 'Calle B' })).toContain('No se pudo buscar'),
    )
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('offers manual entry when no addresses match', async () => {
    mocks.search.mockResolvedValue([])
    render()
    mocks.buttons.get('Buscar coordenadas')?.onPress()
    await vi.waitFor(() => expect(render()).toContain('No encontramos coincidencias'))
    expect(mocks.select).not.toHaveBeenCalled()
  })
})
