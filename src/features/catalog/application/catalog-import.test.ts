import { describe, expect, it } from 'vitest'

import { catalogImportSchema } from './catalog-import'

const row = (Nombre: string, Precio = '12,50') => ({ Nombre, Precio })

describe('catalog import form limits', () => {
  it('accepts the maximum name length and a valid price', () => {
    expect(catalogImportSchema.parse(row('A'.repeat(160))).ok).toBe(true)
  })

  it('rejects overlong names and unsafe or excessive prices', () => {
    expect(catalogImportSchema.parse(row('A'.repeat(161))).ok).toBe(false)
    expect(catalogImportSchema.parse(row('Artículo', '999999999999999999999')).ok).toBe(false)
    expect(catalogImportSchema.parse(row('Artículo', '1000000000')).ok).toBe(false)
  })
})
