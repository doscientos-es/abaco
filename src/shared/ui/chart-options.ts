import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts'
import type { GridComponentOption, TooltipComponentOption } from 'echarts/components'
import type { ComposeOption } from 'echarts/core'

import type { CategoryChartFormat } from '@/shared/domain/category-chart-format'
import { formatEuros } from '@/shared/domain/money'
import type { MonthlyChartFormat } from '@/shared/domain/monthly-chart-format'
import type { MonthPoint } from '@/shared/domain/stats'

export type ChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | PieSeriesOption
  | GridComponentOption
  | TooltipComponentOption
>

const ink = 'var(--muted-foreground)'
const border = 'var(--border)'
const chartGrid = {
  left: 8,
  right: 12,
  bottom: 4,
  outerBoundsMode: 'same',
} satisfies GridComponentOption
const base = {
  animation: false,
  textStyle: { fontFamily: 'Onest, system-ui, sans-serif', color: ink },
} satisfies ChartOption
const moneyTooltip = {
  renderMode: 'richText',
  confine: true,
  backgroundColor: 'var(--popover)',
  borderColor: border,
  textStyle: { color: 'var(--foreground)', fontSize: 12 },
  valueFormatter: (value) => (typeof value === 'number' ? formatEuros(value) : '—'),
} satisfies TooltipComponentOption
const compactEuros = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 2,
})
const amountAxis = {
  type: 'value',
  minInterval: 1,
  splitNumber: 4,
  axisLabel: { formatter: (value: number) => compactEuros.format(value / 100), fontSize: 11 },
  splitLine: { lineStyle: { color: border, type: 'dashed' } },
} as const

export const monthlySeriesLegend = [
  { key: 'income', label: 'Ingresos', color: 'var(--success)' },
  { key: 'expense', label: 'Gastos', color: 'var(--destructive)' },
] as const

export function monthlyChartOption(data: MonthPoint[], format: MonthlyChartFormat): ChartOption {
  return {
    ...base,
    grid: { ...chartGrid, top: 12 },
    tooltip: { ...moneyTooltip, trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.map(({ label, key }) => `${label} ${key.slice(0, 4)}`),
      axisLabel: { formatter: (label: string) => label.split(' ')[0] ?? '', hideOverlap: true },
      axisLine: { lineStyle: { color: border }, onZero: false },
      axisTick: { show: false },
    },
    yAxis: amountAxis,
    series: monthlySeriesLegend.map(({ key, label: name, color }) => {
      const values = { name, data: data.map((month) => month[key]), itemStyle: { color } }
      if (format === 'bars') {
        return { ...values, type: 'bar', barMaxWidth: 22, itemStyle: { color, borderRadius: 3 } }
      }
      return {
        ...values,
        type: 'line',
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color, width: 2 },
        ...(format === 'area' ? { areaStyle: { color, opacity: 0.16 } } : {}),
      }
    }),
  }
}

export type CategoryAmount = { label: string; value: number }
const palette = [
  '--primary',
  '--info',
  '--warning',
  '--success',
  '--destructive',
  '--muted-foreground',
]

export function categoryColor(index: number) {
  return `var(${palette[index % palette.length]})`
}

export function categoryChartOption(
  items: CategoryAmount[],
  format: CategoryChartFormat,
): ChartOption {
  const data = items.map(({ label: name, value }, index) => ({
    name,
    value,
    itemStyle: { color: categoryColor(index) },
  }))
  const shared = { ...base, tooltip: { ...moneyTooltip, trigger: 'item' } } satisfies ChartOption
  if (format === 'ranking') {
    return {
      ...shared,
      grid: { ...chartGrid, top: 8 },
      xAxis: amountAxis,
      yAxis: {
        type: 'category',
        inverse: true,
        data: items.map(({ label }) => label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: border }, onZero: false },
        axisLabel: { width: 100, overflow: 'truncate', interval: 0 },
      },
      series: [{ type: 'bar', data, barMaxWidth: 16, itemStyle: { borderRadius: 3 } }],
    }
  }

  const pie = { type: 'pie', label: { show: false }, emphasis: { scale: false } } as const
  if (format !== 'radial') {
    return {
      ...shared,
      series: [
        {
          ...pie,
          data,
          radius: [format === 'pie' ? '0%' : '66%', '92%'],
          padAngle: data.length > 1 ? 2 : 0,
        },
      ],
    }
  }
  const total = items.reduce((sum, { value }) => sum + value, 0)
  const step = 48 / items.length
  return {
    ...shared,
    series: data.map((item, index) => ({
      ...pie,
      radius: [`${92 - (index + 0.75) * step}%`, `${92 - index * step}%`],
      data: [
        item,
        {
          value: total - item.value,
          itemStyle: { color: 'var(--muted)' },
          tooltip: { show: false },
        },
      ],
    })),
  }
}
