import { describe, expect, it } from 'vitest'

import { estimateEmailTotal } from './estimate-email-total'

const estimate = {
  estimate_lines: [{ quantity: 1, unit_price_cents: 826, discount_percent: 0 }],
  discount_type: 'none',
  discount_value: 0,
  vat_rate: 21,
}

describe('published estimate email total', () => {
  it('uses the exact published total instead of recalculating VAT from the rounded base', () => {
    expect(
      estimateEmailTotal({ estimate, agreement: { version: 1, price: { totalCents: 1000 } } }),
    ).toBe(1000)
  })

  it('preserves the agreed zero amount', () => {
    expect(
      estimateEmailTotal({ estimate, agreement: { version: 1, price: { totalCents: 0 } } }),
    ).toBe(0)
  })

  it('calculates historical snapshots without an agreement, including discounts', () => {
    expect(estimateEmailTotal({ estimate })).toBe(999)
    expect(
      estimateEmailTotal({
        estimate: { ...estimate, discount_type: 'percent', discount_value: 50 },
      }),
    ).toBe(500)
  })

  it('does not send a misleading total for an invalid agreement or snapshot', () => {
    expect(
      estimateEmailTotal({ estimate, agreement: { version: 1, price: { totalCents: '1000' } } }),
    ).toBeNull()
    expect(
      estimateEmailTotal({ estimate, agreement: { version: 2, price: { totalCents: 1000 } } }),
    ).toBeNull()
    expect(estimateEmailTotal({ estimate: {} })).toBeNull()
  })
})
