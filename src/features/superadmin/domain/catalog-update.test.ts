import { describe, expect, it } from 'vitest'

import type { CatalogRate } from '@/features/billing'

import { CatalogFieldError, priceField, readCatalogUpdate, seatPriceField } from './catalog-update'

const display = {
  revision: 7,
  name: 'Escala',
  audience: 'Equipos grandes',
  benefit: 'Coordina el equipo',
}
const rates: CatalogRate[] = [16].map((seats) => ({
  plan: 'scale',
  seats,
  monthly_cents: 24900,
  yearly_cents: 249000,
  seat_monthly_cents: 300,
  vat_percent: 21,
  plan_info: display,
}))

function edit() {
  const form = new FormData()
  form.set('name', '  Escala Plus ')
  form.set('audience', 'Para varias cuadrillas')
  form.set('benefit', 'Organiza el trabajo')
  form.set(priceField(16), '249')
  form.set(seatPriceField, '3,00')
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
      rates: { 16: 24900 },
      seatMonthlyCents: 300,
    })
  })

  it.each(['', '0', '-20', '1e2', '3,001', '10000,01'])(
    'rejects an invalid tier price: %s',
    (price) => {
      const form = edit()
      form.set(priceField(16), price)
      expect(() => readCatalogUpdate(form, rates)).toThrow('tramo de 16')
    },
  )

  it('rejects a missing tier rather than applying an incomplete price update', () => {
    const form = edit()
    form.delete(priceField(16))
    expect(() => readCatalogUpdate(form, rates)).toThrow('tramo de 16')
    expect(() => readCatalogUpdate(form, rates)).toThrow(
      expect.objectContaining({ field: priceField(16) }),
    )
  })

  it('rejects a missing Enterprise seat price', () => {
    const form = edit()
    form.delete(seatPriceField)
    expect(() => readCatalogUpdate(form, rates)).toThrow(
      expect.objectContaining({ field: seatPriceField }),
    )
  })

  it('saves both the base and additional-person price for the new offer', () => {
    const form = edit()
    const existing = rates[0]
    if (!existing) throw new Error('Expected a catalogue rate')
    form.set(priceField(1), '34,80')
    form.set(seatPriceField, '8')
    expect(readCatalogUpdate(form, [{ ...existing, plan: 'standard', seats: 1 }])).toMatchObject({
      plan: 'standard',
      rates: { 1: 3480 },
      seatMonthlyCents: 800,
    })
    form.delete(seatPriceField)
    expect(() => readCatalogUpdate(form, [{ ...existing, plan: 'standard', seats: 1 }])).toThrow(
      expect.objectContaining({ field: seatPriceField }),
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
