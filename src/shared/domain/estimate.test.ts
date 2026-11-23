import { describe, expect, it } from 'vitest'

import { buildLedgerCsv } from './csv'
import {
  calculateTotals,
  defaultMilestones,
  formatEstimateNumber,
  milestoneAmounts,
  paymentMilestonesError,
} from './estimate'
import { parseEuros } from './money'
import type { Estimate, EstimateLine, LedgerEntry } from './types'

const line = (
  kind: EstimateLine['kind'],
  quantity: number,
  unitPriceCents: number,
): EstimateLine => ({
  id: `${kind}-${quantity}`,
  catalogItemId: null,
  description: kind,
  kind,
  unit: 'ud',
  quantity,
  unitPriceCents,
  discountPercent: 0,
})

describe('calculateTotals', () => {
  it('splits materials and labor and applies VAT', () => {
    const totals = calculateTotals([line('material', 2.5, 1000), line('labor', 10, 3000)], 21)
    expect(totals.materialsCents).toBe(2500)
    expect(totals.laborCents).toBe(30000)
    expect(totals.subtotalCents).toBe(32500)
    expect(totals.vatCents).toBe(6825)
    expect(totals.totalCents).toBe(39325)
  })

  it('returns zeros for no lines', () => {
    expect(calculateTotals([], 21).totalCents).toBe(0)
  })

  it('applies a per-line discount, then a global percentage', () => {
    const lines = [{ ...line('labor', 10, 1000), discountPercent: 10 }, line('material', 1, 5000)]
    const totals = calculateTotals(lines, 21, { type: 'percent', value: 10 })
    expect(totals.grossCents).toBe(15000)
    expect(totals.lineDiscountCents).toBe(1000)
    expect(totals.globalDiscountCents).toBe(1400)
    expect(totals.subtotalCents).toBe(12600)
    expect(totals.totalCents).toBe(12600 + 2646)
  })

  it('caps a global amount discount at the base', () => {
    const totals = calculateTotals([line('other', 1, 1000)], 21, { type: 'amount', value: 5000 })
    expect(totals.globalDiscountCents).toBe(1000)
    expect(totals.totalCents).toBe(0)
  })
})

describe('milestoneAmounts', () => {
  it('always sums exactly to the total', () => {
    const amounts = milestoneAmounts(defaultMilestones(40), 100001)
    expect(amounts.reduce((sum, m) => sum + m.amountCents, 0)).toBe(100001)
    expect(amounts[0]?.amountCents).toBe(40000)
  })
})

describe('paymentMilestonesError', () => {
  const estimate = {
    conversionDestination: 'work',
    milestones: [{ id: 'first', label: 'Primer pago', percent: 100 }],
    lines: [line('labor', 1, 10000)],
    vatRate: 0,
    discountType: 'none',
    discountValue: 0,
  } as Estimate

  it('accepts complete single and custom payment plans', () => {
    expect(paymentMilestonesError(estimate)).toBeNull()
    expect(
      paymentMilestonesError({
        ...estimate,
        milestones: [
          { id: 'first', label: 'Señal', percent: 33.33 },
          { id: 'second', label: 'Final', percent: 66.67 },
        ],
      }),
    ).toBeNull()
  })

  it('rejects empty, incomplete and invalid work payment plans', () => {
    for (const milestones of [
      [],
      [{ id: 'first', label: 'Señal', percent: 50 }],
      [{ id: 'first', label: ' ', percent: 100 }],
      [{ id: 'first', label: 'Señal', percent: Number.NaN }],
    ]) {
      expect(paymentMilestonesError({ ...estimate, milestones })).not.toBeNull()
    }
  })

  it('does not require milestones for contracts billed by period', () => {
    expect(
      paymentMilestonesError({ ...estimate, conversionDestination: 'contract', milestones: [] }),
    ).toBeNull()
  })

  it('rejects a split whose rounded installments would exceed the agreed price', () => {
    expect(
      paymentMilestonesError({
        ...estimate,
        lines: [line('labor', 1, 1)],
        milestones: [
          { id: 'first', label: 'Primero', percent: 50 },
          { id: 'second', label: 'Segundo', percent: 50 },
          { id: 'third', label: 'Final', percent: 0 },
        ],
      }),
    ).toContain('céntimos')
  })
})

describe('helpers', () => {
  it('parses Spanish and plain decimals', () => {
    expect(parseEuros('1.234,56')).toBe(123456)
    expect(parseEuros('12.5')).toBe(1250)
    expect(parseEuros('abc')).toBe(0)
  })

  it('formats estimate numbers', () => {
    expect(formatEstimateNumber(7, 2026)).toBe('P-2026-007')
  })
})

describe('buildLedgerCsv', () => {
  it('escapes fields and extracts VAT', () => {
    const entry: LedgerEntry = {
      id: 'l1',
      tenantId: 't',
      kind: 'income',
      date: '2026-01-02',
      concept: 'Señal "baño"; Pérez',
      category: 'Cobro',
      amountCents: 12100,
      vatRate: 21,
      estimateId: null,
      milestoneId: null,
    }
    const csv = buildLedgerCsv([entry])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"Señal ""baño""; Pérez"')
    expect(csv).toContain('100.00;21.00;121.00')
  })
})
