import { describe, expect, it } from 'vitest'

import { emptyStaffArrival, normalizeStaffArrival } from './staff-arrival-actions'

describe('staff-shareable arrival form', () => {
  it('starts private and does not infer any values from a contact or location', () => {
    expect(normalizeStaffArrival(emptyStaffArrival)).toEqual({
      cleaned: {
        instructions: '',
        parking: '',
        contact_label: '',
        contact_phone: '',
        share_directions: false,
        share_contact: false,
      },
      error: '',
    })
  })

  it('requires explicit phone format and content for enabled sharing', () => {
    expect(normalizeStaffArrival({ ...emptyStaffArrival, share_directions: true }).error).toMatch(
      /indicación de entrada/,
    )
    expect(normalizeStaffArrival({ ...emptyStaffArrival, share_contact: true }).error).toMatch(
      /teléfono operativo/,
    )
    expect(
      normalizeStaffArrival({ ...emptyStaffArrival, contact_phone: 'javascript:alert(1)' }).error,
    ).toMatch(/prefijo internacional/)
    expect(
      normalizeStaffArrival({
        ...emptyStaffArrival,
        share_contact: true,
        contact_phone: '+34 (612) 345-678',
      }).cleaned.contact_phone,
    ).toBe('+34612345678')
  })
})
