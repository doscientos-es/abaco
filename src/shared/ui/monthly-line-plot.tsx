import { useId } from 'react'

import type { MonthPoint } from '@/shared/domain/stats'

import type { monthlyLineScale } from './monthly-line-scale'

export const monthlyLineSeries = [
  {
    key: 'income',
    label: 'Ingresos',
    stroke: 'stroke-success',
    color: 'text-success',
    dot: 'bg-success',
  },
  {
    key: 'expense',
    label: 'Gastos',
    stroke: 'stroke-destructive',
    color: 'text-destructive',
    dot: 'bg-destructive',
  },
] as const

type Scale = ReturnType<typeof monthlyLineScale>

export function MonthlyLinePlot({ data, scale }: { data: MonthPoint[]; scale: Scale }) {
  const id = useId()
  const baseline = scale.y(0)
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none size-full"
      aria-hidden="true"
    >
      <defs>
        {monthlyLineSeries.map(({ key, color }) => (
          <linearGradient
            key={key}
            id={`${id}-${key}`}
            x1="0"
            y1="0"
            x2="0"
            y2="100"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" className={color} stopColor="currentColor" stopOpacity="0.18" />
            <stop
              offset={`${baseline}%`}
              className={color}
              stopColor="currentColor"
              stopOpacity="0.03"
            />
            <stop offset="100%" className={color} stopColor="currentColor" stopOpacity="0.16" />
          </linearGradient>
        ))}
      </defs>
      {scale.ticks.map((tick) => (
        <line
          key={tick}
          x1="0"
          x2="100"
          y1={scale.y(tick)}
          y2={scale.y(tick)}
          vectorEffect="non-scaling-stroke"
          className={tick === 0 ? 'stroke-border' : 'stroke-border/70'}
          strokeDasharray={tick === 0 ? undefined : '3 4'}
        />
      ))}
      {monthlyLineSeries.map(({ key, stroke }) => {
        const points = data
          .map((month, index) => `${scale.x(index)},${scale.y(month[key])}`)
          .join(' ')
        return (
          <g key={key}>
            <polygon
              points={`${scale.x(0)},${baseline} ${points} ${scale.x(data.length - 1)},${baseline}`}
              fill={`url(#${id}-${key})`}
            />
            <polyline
              points={points}
              fill="none"
              vectorEffect="non-scaling-stroke"
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
              className={stroke}
              strokeDasharray={key === 'expense' ? '4 4' : undefined}
            />
          </g>
        )
      })}
    </svg>
  )
}

export function MonthlyLineMarkers({
  month,
  scale,
  active,
}: {
  month: MonthPoint
  scale: Scale
  active: boolean
}) {
  const overlap = month.expense === month.income
  return monthlyLineSeries
    .filter(({ key }) => !overlap || key === 'expense')
    .map(({ key, dot }) => (
      <span
        key={key}
        aria-hidden="true"
        style={{ top: `${scale.y(month[key])}%` }}
        className={`ring-card pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${dot} ${active || overlap ? 'size-2.5' : 'size-1.5'} ${active ? 'ring-2' : 'ring-1'} ${overlap ? 'border-success border-2' : ''}`}
      />
    ))
}
