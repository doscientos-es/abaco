import { describe, expect, it } from 'vitest'

import { catalogQuote, smallestRateFor, type CatalogRate } from './plans'

const rate = (plan: CatalogRate['plan'], seats: number, monthly: number): CatalogRate => ({
  plan,
  seats,
  monthly_cents: monthly,
  yearly_cents: monthly * 10,
  vat_percent: 21,
})
const rates = [
  rate('solo', 1, 2000),
  rate('team', 5, 3400),
  rate('business', 15, 5400),
  rate('scale', 25, 6900),
  rate('scale', 50, 11900),
  rate('scale', 200, 32900),
]

describe('catalogue quotes', () => {
  it.each([
    [1, 1],
    [2, 5],
    [6, 15],
    [15, 15],
    [16, 25],
    [25, 25],
    [26, 50],
    [200, 200],
    [201, null],
    [16.5, null],
  ])(
    'recommends the smallest fitting tier for %s people even with unordered rates',
    (members, seats) =>
      expect(smallestRateFor([...rates].reverse(), members)?.seats ?? null).toBe(seats),
  )

  it('quotes the full annual charge, not the displayed monthly equivalent', () => {
    const escala = rate('scale', 200, 32900)
    expect(catalogQuote(escala, 'month')).toMatchObject({ net_cents: 32900, amount_cents: 39809 })
    expect(catalogQuote(escala, 'year')).toEqual({
      plan: 'scale',
      seats: 200,
      period: 'year',
      net_cents: 329000,
      amount_cents: 398090,
    })
  })
})
