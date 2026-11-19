import type { MonthPoint } from '@/shared/domain/stats'

export function monthlyLineScale(data: readonly MonthPoint[]) {
  const values = data.flatMap(({ income, expense }) => [income, expense])
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const interval = Math.max(1, (max - min) / 4)
  const magnitude = 10 ** Math.floor(Math.log10(interval))
  const step = ([1, 2, 2.5, 5, 10].find((size) => size * magnitude >= interval) ?? 10) * magnitude
  const lower = Math.floor(min / step)
  const upper = Math.max(lower + 1, Math.ceil(max / step))
  const ticks = Array.from({ length: upper - lower + 1 }, (_, index) => (lower + index) * step)

  return {
    ticks,
    // Leave room above and below the scale for the markers and labels.
    y: (value: number) => 93 - ((value / step - lower) / (upper - lower)) * 86,
    x: (index: number) => ((index + 0.5) / data.length) * 100,
  }
}
