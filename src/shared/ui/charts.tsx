import { useState, type ReactNode } from 'react'

import { formatEuros } from '@/shared/domain/money'

export type ChartTone = 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'muted'

// Full class names (not built dynamically) so Tailwind can see them.
const toneClasses: Record<ChartTone, { stroke: string; bg: string }> = {
  primary: { stroke: 'stroke-primary', bg: 'bg-primary' },
  info: { stroke: 'stroke-info', bg: 'bg-info' },
  success: { stroke: 'stroke-success', bg: 'bg-success' },
  warning: { stroke: 'stroke-warning', bg: 'bg-warning' },
  danger: { stroke: 'stroke-destructive', bg: 'bg-destructive' },
  muted: { stroke: 'stroke-muted-foreground', bg: 'bg-muted-foreground' },
}
const cycle: ChartTone[] = ['primary', 'info', 'warning', 'success', 'danger', 'muted']

/** Card frame shared by every chart so they all look the same. */
export function ChartCard({
  title,
  description,
  children,
  className = '',
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`border-border bg-card rounded-xl border p-4 ${className}`}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {description ? <p className="text-muted-foreground mb-3 text-xs">{description}</p> : <div className="mb-3" />}
      {children}
    </section>
  )
}

export type BarDatum = { label: string; income: number; expense: number }

/** Income vs expense columns per month. Hover or focus a month to see the exact amounts. */
export function MonthlyBars({
  data,
  incomeLabel = 'Ingresos',
  expenseLabel = 'Gastos',
}: {
  data: BarDatum[]
  incomeLabel?: string
  expenseLabel?: string
}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]))
  const pct = (value: number) => `${Math.max(value > 0 ? 3 : 0, (value / max) * 100)}%`
  return (
    <div>
      <div className="relative flex h-44 items-end gap-2 sm:gap-4">
        {[0, 1, 2, 3].map((line) => (
          <div
            key={line}
            className="border-border/70 pointer-events-none absolute inset-x-0 border-t border-dashed"
            style={{ bottom: `${line * 33.3}%` }}
          />
        ))}
        {data.map((d) => (
          <button
            key={d.label}
            type="button"
            aria-label={`${d.label}: ${incomeLabel} ${formatEuros(d.income)}, ${expenseLabel} ${formatEuros(d.expense)}`}
            className="group focus-visible:ring-ring relative flex h-full flex-1 items-end justify-center gap-1 rounded-md outline-none focus-visible:ring-2"
          >
            <span className="bg-success/80 group-hover:bg-success block w-full max-w-6 rounded-t transition-all" style={{ height: pct(d.income) }} />
            <span className="bg-destructive/70 group-hover:bg-destructive block w-full max-w-6 rounded-t transition-all" style={{ height: pct(d.expense) }} />
            <span
              aria-hidden="true"
              className="bg-popover text-popover-foreground border-border pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max rounded-lg border px-2.5 py-1.5 text-left text-xs shadow-md group-hover:block group-focus-visible:block"
            >
              <span className="block font-medium capitalize">{d.label}</span>
              <span className="text-success block tabular-nums">{incomeLabel}: {formatEuros(d.income)}</span>
              <span className="text-destructive block tabular-nums">{expenseLabel}: {formatEuros(d.expense)}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-4">
        {data.map((d) => (
          <span key={d.label} className="text-muted-foreground flex-1 text-center text-xs capitalize">{d.label}</span>
        ))}
      </div>
      <div className="text-muted-foreground mt-3 flex gap-4 text-xs">
        <span className="flex items-center gap-1.5"><i className="bg-success size-2 rounded-full" />{incomeLabel}</span>
        <span className="flex items-center gap-1.5"><i className="bg-destructive size-2 rounded-full" />{expenseLabel}</span>
      </div>
    </div>
  )
}

export type DonutDatum = { label: string; value: number; tone?: ChartTone }

/** Donut with a legend. Hover a slice or a legend row to highlight it and read its amount. */
export function Donut({
  data,
  format = formatEuros,
  centerLabel = 'Total',
  empty = 'Sin datos todavía',
}: {
  data: DonutDatum[]
  format?: (value: number) => string
  centerLabel?: string
  empty?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const items = data.filter((d) => d.value > 0)
  const total = items.reduce((sum, d) => sum + d.value, 0)
  if (total === 0) return <p className="text-muted-foreground py-10 text-center text-sm">{empty}</p>
  const shown = active === null ? null : items[active]
  const slices = items.map((d, index) => {
    const before = items.slice(0, index).reduce((sum, item) => sum + item.value, 0)
    return {
      ...d,
      share: (d.value / total) * 100,
      start: (before / total) * 100,
      tone: toneClasses[d.tone ?? cycle[index % cycle.length] ?? 'muted'],
    }
  })
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative size-36 shrink-0">
        <svg viewBox="0 0 42 42" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="21" cy="21" r="15.9155" fill="none" strokeWidth="5" className="stroke-muted" />
          {slices.map((d, index) => (
            <circle
              key={d.label}
              cx="21"
              cy="21"
              r="15.9155"
              fill="none"
              strokeWidth={active === index ? 6 : 5}
              strokeDasharray={`${Math.max(d.share - (slices.length > 1 ? 0.8 : 0), 0.1)} ${100 - d.share}`}
              strokeDashoffset={-d.start}
              className={`${d.tone.stroke} cursor-pointer transition-all ${active !== null && active !== index ? 'opacity-40' : ''}`}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-muted-foreground max-w-20 truncate text-xs">{shown ? shown.label : centerLabel}</span>
          <span className="text-sm font-semibold tabular-nums">{format(shown ? shown.value : total)}</span>
          {shown ? <span className="text-muted-foreground text-xs">{Math.round((shown.value / total) * 100)}%</span> : null}
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1">
        {slices.map((d, index) => (
          <li key={d.label}>
            <button
              type="button"
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              className={`focus-visible:ring-ring flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs outline-none transition-colors focus-visible:ring-2 ${active === index ? 'bg-muted' : ''}`}
            >
              <i className={`${d.tone.bg} size-2 shrink-0 rounded-full`} />
              <span className="min-w-0 flex-1 truncate">{d.label}</span>
              <span className="text-muted-foreground tabular-nums">{format(d.value)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
