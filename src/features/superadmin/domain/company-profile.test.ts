import { describe, expect, it } from 'vitest'

import {
  companyProfileErrors,
  normalizedCompanyProfile,
  type CompanyProfileValues,
} from './company-profile'

const profile: CompanyProfileValues = {
  name: ' Empresa ',
  legal_name: '',
  tax_id: '',
  email: '',
  phone: '',
  address: '',
  postal_code: '',
  city: '',
  website: '',
}

describe('company profile', () => {
  it('normalizes editable fields without carrying financial or version fields', () => {
    expect(
      normalizedCompanyProfile({
        ...profile,
        email: ' hola@example.test ',
        updated_at: 'x',
      } as CompanyProfileValues),
    ).toEqual({ ...profile, name: 'Empresa', email: 'hola@example.test' })
  })

  it('validates required names, optional contact data and length limits', () => {
    expect(companyProfileErrors(profile)).toEqual({})
    expect(
      companyProfileErrors({
        ...profile,
        name: '  ',
        email: 'invalid',
        website: 'javascript:alert(1)',
        city: 'x'.repeat(101),
      }),
    ).toEqual({
      name: 'Escribe un nombre de hasta 120 caracteres.',
      email: 'Escribe un correo válido.',
      website: 'Introduce una web válida con http:// o https://.',
      city: 'Máximo 100 caracteres.',
    })
    expect(
      companyProfileErrors({
        ...profile,
        email: 'hola@example.test',
        website: 'https://empresa.es',
      }),
    ).toEqual({})
  })
})
