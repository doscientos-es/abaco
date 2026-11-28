import { describe, expect, it } from 'vitest'

import { reviewedWorkExtra, workExtraAmounts, workExtraReviewKey } from './work-extra-review'

describe('work extra decision review', () => {
  it('compares base and tax without shifting the rounded cent', () => {
    expect(workExtraAmounts(12500, 21)).toEqual({ net: 12500, vat: 2625, gross: 15125 })
    expect(workExtraAmounts(50, 21)).toEqual({ net: 50, vat: 11, gross: 61 })
    expect(workExtraAmounts(12005, 4.25)).toEqual({ net: 12005, vat: 510, gross: 12515 })
    expect(workExtraAmounts(0, 0)).toEqual({ net: 0, vat: 0, gross: 0 })
  })

  it('fails closed when an amount or exact rate cannot be confirmed', () => {
    expect(workExtraAmounts(190.3, 21)).toBeNull()
    expect(workExtraAmounts(100, 0.001)).toBeNull()
    expect(workExtraAmounts(100, Infinity)).toBeNull()
    expect(workExtraAmounts(Number.MAX_SAFE_INTEGER, 21)).toBeNull()
  })

  it('invalidates confirmation if the reviewed extra or amount changes', () => {
    const current = workExtraReviewKey('extra-a', workExtraAmounts(100, 21))
    expect(reviewedWorkExtra(current, current)).toBe(true)
    expect(
      reviewedWorkExtra(current, workExtraReviewKey('extra-b', workExtraAmounts(100, 21))),
    ).toBe(false)
    expect(
      reviewedWorkExtra(current, workExtraReviewKey('extra-a', workExtraAmounts(101, 21))),
    ).toBe(false)
    expect(reviewedWorkExtra(null, null)).toBe(false)
  })
})
