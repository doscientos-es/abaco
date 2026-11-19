import type { Cents, LedgerEntry, LedgerKind } from './types'

export type MonthPoint = { key: string; label: string; income: Cents; expense: Cents }

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Calendar months including the current one; accepts ISO dates or timestamps. */
export function filterByRecentMonths<T>(
  items: T[],
  months: 'all' | 1 | 6 | 12,
  dateOf: (item: T) => string,
  now = new Date(),
): T[] {
  if (months === 'all') return items
  const first = monthKey(new Date(now.getFullYear(), now.getMonth() - months + 1, 1))
  const last = monthKey(now)
  return items.filter((item) => {
    const month = dateOf(item).slice(0, 7)
    return month.length === 7 && month >= first && month <= last
  })
}

/** Income and expenses for each of the last `months` months, oldest first (empty months are kept). */
export function monthlySeries(ledger: LedgerEntry[], months = 6, now = new Date()): MonthPoint[] {
  const formatter = new Intl.DateTimeFormat('es-ES', { month: 'short' })
  const points: MonthPoint[] = []
  for (let offset = months - 1; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const key = monthKey(date)
    let income = 0
    let expense = 0
    for (const entry of ledger) {
      if (!entry.date.startsWith(key)) continue
      if (entry.kind === 'income') income += entry.amountCents
      else expense += entry.amountCents
    }
    points.push({ key, label: formatter.format(date).replace('.', ''), income, expense })
  }
  return points
}

/** Totals per category, biggest first. Everything after `limit` categories is grouped as "Otros". */
export function categoryTotals(
  entries: LedgerEntry[],
  kind: LedgerKind,
  limit = 5,
): { label: string; value: Cents }[] {
  const totals = new Map<string, Cents>()
  for (const entry of entries) {
    if (entry.kind !== kind) continue
    const label = entry.category.trim() || 'Sin categoría'
    totals.set(label, (totals.get(label) ?? 0) + entry.amountCents)
  }
  const sorted = [...totals]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
  if (sorted.length <= limit) return sorted
  const rest = sorted.slice(limit).reduce((sum, item) => sum + item.value, 0)
  return [...sorted.slice(0, limit), { label: 'Otros', value: rest }]
}
