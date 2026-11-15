import { describe, expect, it } from 'vitest'

import {
  locationInput,
  locationPersistenceInput,
  parseLocationCoordinates,
  sameLocationInput,
  validLocationInput,
} from './client-location'

describe('centre coordinates', () => {
  it('accepts an optional pair and rounds to database precision', () => {
    expect(parseLocationCoordinates('')).toEqual({ latitude: null, longitude: null })
    expect(parseLocationCoordinates(' 35.292345678, -2.9381 ')).toEqual({
      latitude: 35.2923457,
      longitude: -2.9381,
    })
    expect(parseLocationCoordinates('-90, 180')).toEqual({ latitude: -90, longitude: 180 })
  })

  it.each(['91, 0', '0, -181', '35', '35,', '1, 2, 3', 'NaN, 0'])(
    'rejects invalid coordinates: %s',
    (coordinates) => {
      const input = { ...locationInput(), name: 'Centro', address: 'Calle 1', coordinates }
      expect(validLocationInput(input)).toBe(false)
      expect(() => locationPersistenceInput(input)).toThrow('coordenadas válidas')
    },
  )

  it('compares equivalent coordinates after rounding', () => {
    const input = { ...locationInput(), coordinates: '35.292345678, -2.9381' }
    expect(sameLocationInput(input, { ...input, coordinates: '35.2923457, -2.9381000' })).toBe(true)
    expect(sameLocationInput(input, { ...input, coordinates: '' })).toBe(false)
  })
})
