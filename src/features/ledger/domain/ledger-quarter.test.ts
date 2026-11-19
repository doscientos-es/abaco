import { expect, it } from 'vitest'

import type { LedgerEntry } from '@/shared/domain/types'

import { ledgerEntriesInQuarter, ledgerQuarterOptions } from './ledger-quarter'
import { ledgerSummaryData } from './ledger-summary-data'

function entry(date: string, kind: LedgerEntry['kind'], amountCents: number): LedgerEntry {
  return {
    id: date,
    tenantId: 'test',
    date,
    kind,
    category: kind === 'expense' ? 'Materiales' : 'Servicios',
    concept: date,
    amountCents,
    vatRate: 21,
    estimateId: null,
    milestoneId: null,
  }
}

it('offers every quarter in the current year and years with entries, without duplicates', () => {
  const options = ledgerQuarterOptions([2024, 2024, 2026], 2026)
  expect(options.map(({ value }) => value)).toEqual([
    '2026-T4',
    '2026-T3',
    '2026-T2',
    '2026-T1',
    '2024-T4',
    '2024-T3',
    '2024-T2',
    '2024-T1',
  ])
  expect(options[2]?.label).toBe('T2 2026 · abr–jun')
  expect(ledgerQuarterOptions([], 2026)).toHaveLength(4)
})

it('uses calendar quarter boundaries for totals, VAT, categories and the monthly chart', () => {
  const quarter = { year: 2026, quarter: 2 }
  const entries = ledgerEntriesInQuarter(
    [
      entry('2025-04-01', 'income', 12100),
      entry('2026-03-31', 'expense', 12100),
      entry('2026-04-01', 'income', 24200),
      entry('2026-06-30', 'expense', 12100),
      entry('2026-07-01', 'income', 12100),
    ],
    quarter,
  )
  const summary = ledgerSummaryData(entries, quarter)

  expect(summary.income).toBe(24200)
  expect(summary.expenses).toBe(12100)
  expect(summary.vat).toEqual({ collected: 4200, paid: 2100 })
  expect(summary.series.map(({ key, income, expense }) => [key, income, expense])).toEqual([
    ['2026-04', 24200, 0],
    ['2026-05', 0, 0],
    ['2026-06', 0, 12100],
  ])
})
