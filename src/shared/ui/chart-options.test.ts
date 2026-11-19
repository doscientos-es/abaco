import { init } from 'echarts/core'
import { expect, it } from 'vitest'

import { categoryChartFormats } from '@/shared/domain/category-chart-format'
import { monthlyChartFormats } from '@/shared/domain/monthly-chart-format'

import { categoryChartOption, monthlyChartOption, type ChartOption } from './chart-options'
import './chart-renderer'

function renderSvg(option: ChartOption) {
  const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 380, height: 220 })
  try {
    chart.setOption(option)
    return chart.renderToSVGString()
  } finally {
    chart.dispose()
  }
}

const months = [
  { key: '2026-01', label: 'ene', income: -5000, expense: 2000 },
  { key: '2026-02', label: 'feb', income: 10000, expense: 0 },
]
const categories = [
  { label: 'Material', value: 7500 },
  { label: 'Transporte', value: 2500 },
]

it.each(monthlyChartFormats)('renders monthly %s with signed and zero amounts', (format) => {
  const option = monthlyChartOption(months, format)
  expect(option.series).toMatchObject([
    { name: 'Ingresos', data: [-5000, 10000], type: format === 'bars' ? 'bar' : 'line' },
    { name: 'Gastos', data: [2000, 0], type: format === 'bars' ? 'bar' : 'line' },
  ])
  const svg = renderSvg(option)
  expect(svg).toContain('>ene</text>')
  expect(svg).toContain('>feb</text>')
  expect(svg).toMatch(/(?:fill|stroke)="var\(--success\)"/)
  const series = Array.isArray(option.series) ? option.series[0] : undefined
  expect(series && 'areaStyle' in series).toBe(format === 'area')
})

it.each(categoryChartFormats)('draws %s using the registered ECharts series', (format) => {
  const svg = renderSvg(categoryChartOption(categories, format))
  expect(svg).toContain('fill="var(--primary)"')
  expect(svg).toContain('fill="var(--info)"')
})

it('models each radial ring as a share of the same total', () => {
  expect(categoryChartOption(categories, 'radial').series).toMatchObject([
    { type: 'pie', data: [{ value: 7500 }, { value: 2500, tooltip: { show: false } }] },
    { type: 'pie', data: [{ value: 2500 }, { value: 7500, tooltip: { show: false } }] },
  ])
})
