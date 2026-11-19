import { describe, expect, it } from 'vitest'

import type { CatalogRate } from '@/features/billing'

import { CatalogFieldError, priceField, readCatalogUpdate } from './catalog-update'

const display = {
  revision: 7,
  name: 'Escala',
  audience: 'Equipos grandes',
  benefit: 'Coordina el equipo',
}
const rates: CatalogRate[] = [25, 50].map((seats) => ({
  plan: 'scale',
  seats,
  monthly_cents: 6900,
  yearly_cents: 69000,
  vat_percent: 21,
  plan_info: display,
}))

function edit() {
  const form = new FormData()
  form.set('name', '  Escala Plus ')
  form.set('audience', 'Para varias cuadrillas')
  form.set('benefit', 'Organiza el trabajo')
  form.set(priceField(25), '64,90')
  form.set(priceField(50), '100.25')
  return form
}

describe('editing plan pricing', () => {
  it('serializes all tiers of one plan as integer cents with the revision the operator edited', () => {
    expect(readCatalogUpdate(edit(), rates)).toEqual({
      plan: 'scale',
      revision: 7,
      name: 'Escala Plus',
      audience: 'Para varias cuadrillas',
      benefit: 'Organiza el trabajo',
      rates: { 25: 6490, 50: 10025 },
    })
  })

  it.each(['', '0', '-20', '1e2', '3,001', '10000,01'])(
    'rejects an invalid tier price: %s',
    (price) => {
      const form = edit()
      form.set(priceField(50), price)
      expect(() => readCatalogUpdate(form, rates)).toThrow('tramo de 50')
    },
  )

  it('rejects a missing tier rather than applying an incomplete price update', () => {
    const form = edit()
    form.delete(priceField(25))
    expect(() => readCatalogUpdate(form, rates)).toThrow('tramo de 25')
    expect(() => readCatalogUpdate(form, rates)).toThrow(
      expect.objectContaining({ field: priceField(25) }),
    )
  })

  it('attributes whitespace-only public copy to the corresponding field', () => {
    const form = edit()
    form.set('benefit', '  ')
    expect(() => readCatalogUpdate(form, rates)).toThrow(CatalogFieldError)
    expect(() => readCatalogUpdate(form, rates)).toThrow(
      expect.objectContaining({ field: 'benefit' }),
    )
  })
})
