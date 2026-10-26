import { describe, expect, it } from 'vitest'

import { workProfitability, type WorkProfitabilitySummary } from './work-profitability'

const summary: WorkProfitabilitySummary = {
  actualCostCents: 7_000,
  activeCostCount: 1,
  approvedExtraSaleCents: 2_000,
  billedNetCents: 10_000,
  billedGrossCents: 12_100,
  collectedGrossCents: 6_050,
  invoiceCount: 1,
}

describe('workProfitability', () => {
  it('keeps approved sale, invoicing, cash and recorded cost separate', () => {
    expect(workProfitability(15_000, summary)).toMatchObject({
      saleNetCents: 17_000,
      recordedCostCents: 7_000,
      billedMarginCents: 3_000,
      billedMarginPercent: 30,
      costDataIncomplete: true,
    })
  })

  it('does not interpret missing costs or an unbilled work as zero-cost profit', () => {
    expect(workProfitability(null, { ...summary, activeCostCount: 0 })).toMatchObject({
      saleNetCents: null,
      recordedCostCents: null,
      billedMarginCents: null,
      billedMarginPercent: null,
    })
    expect(workProfitability(0, { ...summary, invoiceCount: 0, billedNetCents: 0 })).toMatchObject({
      billedMarginCents: null,
      billedMarginPercent: null,
    })
  })
})
