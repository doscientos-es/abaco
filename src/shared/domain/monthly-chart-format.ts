export const monthlyChartFormats = ['bars', 'lines', 'area'] as const

export type MonthlyChartFormat = (typeof monthlyChartFormats)[number]

export function resolveMonthlyChartFormat(value: unknown): MonthlyChartFormat {
  return monthlyChartFormats.find((format) => format === value) ?? 'bars'
}
