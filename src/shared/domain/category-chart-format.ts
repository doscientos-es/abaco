export const categoryChartFormats = ['donut', 'radial', 'ranking'] as const

export type CategoryChartFormat = (typeof categoryChartFormats)[number]

export function resolveCategoryChartFormat(value: unknown): CategoryChartFormat {
  return categoryChartFormats.find((format) => format === value) ?? 'donut'
}
