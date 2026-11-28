import { moveDays } from '@/shared/lib/date-range'

export function visitDraftRanges(days: readonly (string | undefined)[], today: string) {
  const from = moveDays(today, -15)
  const to = moveDays(today, 15)
  const ranges = [{ from, to }]
  const outliers = [...new Set(days)]
    .filter((day): day is string => Boolean(day && (day < from || day > to)))
    .sort()
  for (const day of outliers) {
    const last = ranges.at(-1)
    if (last && ranges.length > 1 && day <= moveDays(last.from, 7)) last.to = day
    else ranges.push({ from: day, to: day })
  }
  return ranges
}
