import { describe, expect, it } from 'vitest'

import type { Client } from '@/shared/domain/types'

import { findPotentialClientDuplicates } from './client-duplicates'

const existing: Client[] = [
  {
    id: 'a',
    tenantId: 'tenant',
    name: 'Comunidad Álamo',
    taxId: 'H-12345678',
    email: 'admin@example.es',
    phone: '+34 600 123 456',
    address: '',
    notes: '',
  },
]

describe('client duplicate suggestions', () => {
  it('matches normalized fiscal ID, email, phone and accented name without merging records', () => {
    const matches = findPotentialClientDuplicates(
      {
        name: 'Comunidad Alamo',
        kind: 'community',
        taxId: 'h12345678',
        email: 'ADMIN@EXAMPLE.ES',
        phone: '+34 600-123-456',
        address: '',
        billingAddress: '',
        notes: '',
      },
      existing,
    )
    expect(matches).toHaveLength(1)
    expect(matches[0]?.reasons).toEqual([
      'mismo NIF/CIF',
      'mismo email',
      'mismo teléfono',
      'mismo nombre',
    ])
  })

  it('excludes the record currently being edited', () => {
    const original = existing[0]
    if (!original) throw new Error('Falta el cliente de prueba')
    const input = { ...original, billingAddress: '' }
    expect(findPotentialClientDuplicates(input, existing, 'a')).toEqual([])
  })
})
