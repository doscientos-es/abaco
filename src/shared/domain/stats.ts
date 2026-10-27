import type { Cents, LedgerEntry, LedgerKind } from './types'

export type MonthPoint = { key: string; label: string; income: Cents; expense: Cents }

/** Income and expenses for each of the last `months` months, oldest first (empty months are kept). */
export function monthlySeries(ledger: LedgerEntry[], months = 6, now = new Date()): MonthPoint[] {
  const formatter = new Intl.DateTimeFormat('es-ES', { month: 'short' })
  const points: MonthPoint[] = []
  for (let offset = months - 1; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
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
