import type { ReactNode } from 'react'

export type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'info'

const iconTone: Record<StatTone, string> = {
  default: 'bg-secondary text-muted-foreground',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
}
const lineTone: Record<StatTone, string> = {
  default: 'stroke-muted-foreground',
  success: 'stroke-success',
  warning: 'stroke-warning',
  danger: 'stroke-destructive',
  info: 'stroke-info',
}

/** Compact KPI card. Every summary card in the app uses this one so they all match. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  trend,
  className = '',
}: {
  label: string
  value: string
  hint?: string
  icon?: ReactNode
  tone?: StatTone
  /** Optional values drawn as a tiny line on the right. */
  trend?: number[]
  className?: string
}) {
  return (
    <div
      className={`border-border bg-card flex min-w-0 items-center gap-3 rounded-xl border px-3.5 py-3 ${className}`}
    >
      {icon ? (
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4 ${iconTone[tone]}`}
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground truncate text-xs">{label}</p>
        <p className="truncate text-xl leading-tight font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        {hint ? <p className="text-muted-foreground truncate text-xs">{hint}</p> : null}
      </div>
      {trend && trend.length > 1 ? <Sparkline values={trend} className={lineTone[tone]} /> : null}
    </div>
  )
}

function Sparkline({ values, className }: { values: number[]; className: string }) {
  const min = Math.min(...values)
  const range = Math.max(...values) - min || 1
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 60},${22 - ((v - min) / range) * 20}`)
    .join(' ')
  return (
    <svg viewBox="0 0 60 24" className="hidden h-7 w-16 shrink-0 sm:block" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      />
    </svg>
  )
}
