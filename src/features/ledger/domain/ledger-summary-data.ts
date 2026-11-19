import { ledgerVatSummary } from '@/shared/domain/csv'
import { categoryTotals, monthlySeries } from '@/shared/domain/stats'
import type { LedgerEntry } from '@/shared/domain/types'

import { ledgerQuarterEnd, type LedgerQuarter } from './ledger-quarter'

export function ledgerSummaryData(entries: LedgerEntry[], quarter: LedgerQuarter | null) {
  return {
    entries,
    quarter,
    series: quarter
      ? monthlySeries(entries, 3, ledgerQuarterEnd(quarter))
      : monthlySeries(entries, 12),
    income: entries.reduce(
      (total, entry) => total + (entry.kind === 'income' ? entry.amountCents : 0),
      0,
    ),
    expenses: entries.reduce(
      (total, entry) => total + (entry.kind === 'expense' ? entry.amountCents : 0),
      0,
    ),
    vat: ledgerVatSummary(entries),
    categories: categoryTotals(entries, 'expense'),
  }
}
