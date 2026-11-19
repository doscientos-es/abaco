import { useState } from 'react'

import { formatEuros } from '@/shared/domain/money'
import type { MonthPoint } from '@/shared/domain/stats'

import { EmptyHint } from './charts'
import { fieldIcons } from './field-icons'
import {
  MonthlyLineMarkers,
  MonthlyLinePlot,
  monthlyLineSeries as series,
} from './monthly-line-plot'
import { monthlyLineScale } from './monthly-line-scale'

const axisCurrency = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 2,
})

/** The same monthly amounts as the bar chart, with keyboard-accessible details. */
export function MonthlyLines({ data }: { data: MonthPoint[] }) {
  if (data.every((month) => month.income === 0 && month.expense === 0)) {
    return (
      <EmptyHint
        icon={fieldIcons.bank}
        title="Sin movimientos todavía"
        description="Cuando registres cobros y gastos verás aquí su evolución mes a mes."
      />
    )
  }

  return <MonthlyTrend data={data} />
}

function MonthlyTrend({ data }: { data: MonthPoint[] }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const scale = monthlyLineScale(data)
  const activeIndex = data.findIndex(({ key }) => key === (hovered ?? focused))
  const activeMonth = data[activeIndex]

  return (
    <div className="@container space-y-2">
      <div className="text-muted-foreground flex justify-end gap-4 text-xs">
        {series.map(({ key, label, dot }) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`${dot} size-2 rounded-full`} /> {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)]">
        <div
          aria-hidden="true"
          className="text-muted-foreground relative grid grid-cols-1 pr-2 text-right text-[0.625rem] tabular-nums"
        >
          {scale.ticks.map((tick) => (
            <span
              key={tick}
              className="relative col-start-1 row-start-1 h-max -translate-y-1/2"
              style={{ top: `${scale.y(tick)}%` }}
            >
              {axisCurrency.format(tick / 100)}
            </span>
          ))}
        </div>
        <div className="relative h-40 @min-[28rem]:h-48">
          <MonthlyLinePlot data={data} scale={scale} />
          <div className="absolute inset-0 flex" onPointerLeave={() => setHovered(null)}>
            {data.map((month, index) => (
              <button
                key={month.key}
                type="button"
                aria-label={`${month.label}: Ingresos ${formatEuros(month.income)}, Gastos ${formatEuros(month.expense)}`}
                className="focus-visible:ring-ring relative min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-inset"
                onPointerEnter={(event) => {
                  if (event.pointerType !== 'touch') setHovered(month.key)
                }}
                onFocus={() => {
                  setHovered(null)
                  setFocused(month.key)
                }}
                onBlur={() => setFocused(null)}
                onClick={(event) => {
                  event.currentTarget.focus()
                  setFocused(month.key)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return
                  setHovered(null)
                  setFocused(null)
                }}
              >
                {index === activeIndex ? (
                  <span
                    aria-hidden="true"
                    className="border-muted-foreground/50 pointer-events-none absolute inset-y-[7%] left-1/2 border-l border-dashed"
                  />
                ) : null}
                <MonthlyLineMarkers month={month} scale={scale} active={index === activeIndex} />
              </button>
            ))}
          </div>
          {activeMonth ? (
            <TrendTooltip
              month={activeMonth}
              left={scale.x(activeIndex)}
              below={scale.y(Math.max(activeMonth.income, activeMonth.expense)) < 45}
            />
          ) : null}
        </div>
        <div aria-hidden="true" className="col-start-2 mt-1 flex">
          {data.map((month, index) => (
            <span
              key={month.key}
              className="text-muted-foreground min-w-0 flex-1 truncate text-center text-[0.6875rem] capitalize"
            >
              <span
                className={
                  data.length > 6 && index % 3 !== 0 && index !== data.length - 1
                    ? 'hidden @min-[28rem]:inline'
                    : ''
                }
              >
                {month.label}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function TrendTooltip({ month, left, below }: { month: MonthPoint; left: number; below: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`bg-popover text-popover-foreground border-border pointer-events-none absolute z-10 w-48 max-w-full -translate-x-1/2 rounded-xl border p-2.5 text-xs shadow-md ${below ? 'bottom-2' : 'top-2'}`}
      style={{ left: `clamp(min(6rem, 50%), ${left}%, max(calc(100% - 6rem), 50%))` }}
    >
      <p className="mb-1.5 font-semibold capitalize">
        {month.label} {month.key.slice(0, 4)}
      </p>
      <dl className="space-y-1">
        {series.map(({ key, label, dot }) => (
          <div key={key} className="flex items-center justify-between gap-1">
            <dt className="text-muted-foreground flex items-center gap-1.5">
              <span className={`${dot} size-1.5 rounded-full`} />
              {label}
            </dt>
            <dd className="text-right font-medium tabular-nums">{formatEuros(month[key])}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
