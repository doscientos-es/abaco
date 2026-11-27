import { describe, expect, it } from 'vitest'

import { baseForGrossCharge } from './agreed-charge'

describe('exact agreed charge', () => {
  it('backs out IVA and included module surcharges from the exact gross amount', () => {
    expect(baseForGrossCharge(12_100, 2_000, 21)).toBe(8_000)
    expect(baseForGrossCharge(9_900, 900, 0)).toBe(9_000)
  })

  it('rejects impossible VAT rounding, amounts below modules and out-of-range bases', () => {
    expect(baseForGrossCharge(3, 0, 21)).toBeNull()
    expect(baseForGrossCharge(1_210, 1_000, 21)).toBeNull()
    expect(baseForGrossCharge(10_000_001, 0, 0)).toBeNull()
  })
})
