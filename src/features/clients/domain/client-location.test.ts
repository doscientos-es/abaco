import { describe, expect, it } from 'vitest'

import {
  locationInput,
  locationPersistenceInput,
  parseLocationCoordinates,
  setLocationClientDetails,
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

  it('validates and compares structured opening hours without losing free-text hours', () => {
    const monday = { weekday: 1, start: '09:00', end: '18:00' }
    const slots = [monday]
    const input = {
      ...locationInput(),
      name: 'Centro',
      address: 'Calle',
      opening_hours: 'Texto anterior',
      opening_schedule: slots,
    }
    expect(validLocationInput(input)).toBe(true)
    expect(sameLocationInput(input, { ...input, opening_schedule: [...slots] })).toBe(true)
    expect(sameLocationInput(input, { ...input, opening_schedule: null })).toBe(false)
    expect(
      validLocationInput({
        ...input,
        opening_schedule: [...slots, { ...monday, start: '12:00' }],
      }),
    ).toBe(false)
    expect(locationPersistenceInput(input)).toMatchObject({
      opening_hours: 'Texto anterior',
      opening_schedule: slots,
    })
  })
})

describe('inheriting client details for new centres', () => {
  it('keeps inherited details by default, preserves distinct values, and restores inheritance', () => {
    const draft = {
      id: 'new-centre',
      original: null,
      input: {
        ...locationInput(),
        address: 'Client address',
        operational_contact: 'Client contact',
      },
      usesClientDetails: true,
    }

    const distinct = setLocationClientDetails(draft, true, {
      address: 'Client address',
      operational_contact: 'Client contact',
    })
    expect(distinct.usesClientDetails).toBe(false)
    expect(
      setLocationClientDetails(
        { ...distinct, input: { ...distinct.input, address: 'Centre address' } },
        false,
        { address: 'Updated client address', operational_contact: 'Updated contact' },
      ),
    ).toMatchObject({
      usesClientDetails: true,
      input: { address: 'Updated client address', operational_contact: 'Updated contact' },
    })
  })
})
