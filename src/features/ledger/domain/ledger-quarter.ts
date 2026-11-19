import type { LedgerEntry } from '@/shared/domain/types'

export type LedgerQuarter = { year: number; quarter: number }

const quarterLabels = ['ene–mar', 'abr–jun', 'jul–sep', 'oct–dic']

export function ledgerQuarterOptions(years: number[], currentYear = new Date().getFullYear()) {
  return [...new Set([currentYear, ...years])]
    .sort((a, b) => b - a)
    .flatMap((year) =>
      [4, 3, 2, 1].map((quarter) => ({
        year,
        quarter,
        value: `${year}-T${quarter}`,
        label: `T${quarter} ${year} · ${quarterLabels[quarter - 1]}`,
      })),
    )
}

export function ledgerQuarterEnd({ year, quarter }: LedgerQuarter) {
  return new Date(year, quarter * 3 - 1, 1)
}

export function ledgerEntriesInQuarter(entries: LedgerEntry[], { year, quarter }: LedgerQuarter) {
  const yearPrefix = `${year}-`
  return entries.filter(
    ({ date }) =>
      date.startsWith(yearPrefix) && Math.ceil(Number(date.slice(5, 7)) / 3) === quarter,
  )
}
