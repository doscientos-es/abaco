import { describe, expect, it } from 'vitest'

import {
  catalogQuote,
  sameCapacity,
  smallestRateFor,
  withModulePrice,
  type CatalogRate,
} from './plans'

const rate = (
  plan: CatalogRate['plan'],
  seats: number,
  monthly: number,
  seatMonthly = 0,
): CatalogRate => ({
  plan,
  seats,
  monthly_cents: monthly,
  yearly_cents: monthly * 10,
  seat_monthly_cents: seatMonthly,
  vat_percent: 21,
})
const rates = [
  rate('solo', 1, 2900),
  rate('team', 5, 6900),
  rate('business', 15, 19900),
  rate('scale', 16, 24900, 300),
]

describe('catalogue quotes', () => {
  it.each([
    [1, 1],
    [2, 5],
    [6, 15],
    [15, 15],
    [16, 16],
    [17, 17],
    [200, 200],
    [201, null],
    [16.5, null],
  ])(
    'recommends the smallest fitting tier for %s people even with unordered rates',
    (members, seats) =>
      expect(smallestRateFor([...rates].reverse(), members)?.seats ?? null).toBe(seats),
  )

  it('adds the Enterprise price per seat to the base and charges annual terms once', () => {
    const enterprise = rate('scale', 16, 24900, 300)
    expect(catalogQuote(enterprise, 'month')).toMatchObject({
      net_cents: 29700,
      amount_cents: 35937,
    })
    expect(catalogQuote(enterprise, 'year')).toEqual({
      plan: 'scale',
      seats: 16,
      period: 'year',
      net_cents: 297000,
      amount_cents: 359370,
      vat_percent: 21,
    })
  })

  it('does not add VAT to either the base plan or the modules at 0 %', () => {
    const team = rate('team', 5, 6900)
    expect(withModulePrice(catalogQuote(team, 'month', 0), 1000)).toMatchObject({
      base_net_cents: 6900,
      net_cents: 7900,
      amount_cents: 7900,
      vat_percent: 0,
    })
  })

  it('compares dynamic capacity quotes by plan and seats, not object identity', () => {
    expect(sameCapacity(smallestRateFor(rates, 20), rate('scale', 20, 24900, 300))).toBe(true)
    expect(sameCapacity(rate('solo', 1, 2900), rate('team', 5, 6900))).toBe(false)
  })
})
