import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { estimateTotalCents } from '@/shared/domain/estimate'
import { formatEuros } from '@/shared/domain/money'
import { filterByRecentMonths } from '@/shared/domain/stats'
import type { Estimate, EstimateStatus } from '@/shared/domain/types'
import { ChartCard, EmptyHint } from '@/shared/ui/chart-card'
import { chartPeriodLabels } from '@/shared/ui/chart-settings'
import { fieldIcons } from '@/shared/ui/field-icons'
import { statusLabels } from '@/shared/ui/status-badge'

const statuses: { id: EstimateStatus; color: string; stroke: string }[] = [
  { id: 'draft', color: 'bg-muted-foreground', stroke: 'stroke-muted-foreground' },
  { id: 'sent', color: 'bg-info', stroke: 'stroke-info' },
  { id: 'accepted', color: 'bg-success', stroke: 'stroke-success' },
  { id: 'rejected', color: 'bg-destructive', stroke: 'stroke-destructive' },
]

type StatusChart = { months: 'all' | 6 | 12; metric: 'amount' | 'count' }

export function EstimateStatusSummary({
  estimates,
  months = 'all',
  metric = 'amount',
  settings,
}: {
  estimates: Estimate[]
  months?: StatusChart['months']
  metric?: StatusChart['metric']
  settings?: ReactNode
}) {
  const period =
    months === 'all'
      ? chartPeriodLabels.all
      : `Creados en los ${chartPeriodLabels[months].toLowerCase()}`
  const measure = metric === 'count' ? 'Por cantidad' : 'Por importe'
  return (
    <ChartCard
      title="Presupuestos por estado"
      description={`${period} · ${measure}`}
      settings={settings}
    >
      <EstimateStatusPlot estimates={estimates} months={months} metric={metric} />
    </ChartCard>
  )
}

function EstimateStatusPlot({
  estimates: allEstimates,
  months,
  metric,
}: StatusChart & { estimates: Estimate[] }) {
  const estimates = filterByRecentMonths(allEstimates, months, (estimate) => estimate.createdAt)
  const groups = statuses.map(({ id, color, stroke }) => {
    const matching = estimates.filter((estimate) => estimate.status === id)
    return {
      id,
      color,
      stroke,
      count: matching.length,
      amount: matching.reduce((sum, estimate) => sum + estimateTotalCents(estimate), 0),
    }
  })
  const total = groups.reduce((sum, group) => sum + group.amount, 0)
  const chartValue = (group: (typeof groups)[number]) =>
    metric === 'count' ? group.count : Math.max(0, group.amount)
  const chartTotal = groups.reduce((sum, group) => sum + chartValue(group), 0)
  const segments = groups.reduce<{ offset: number; value: number; stroke: string; id: string }[]>(
    (items, group) => {
      const previous = items.at(-1)
      const offset = previous ? previous.offset + previous.value : 0
      const value = chartTotal > 0 ? (chartValue(group) / chartTotal) * 100 : 0
      return [...items, { id: group.id, stroke: group.stroke, offset, value }]
    },
    [],
  )

  return (
    <>
      {estimates.length === 0 ? (
        <EmptyHint
          icon={fieldIcons.file}
          title={
            allEstimates.length ? 'No hay presupuestos en este periodo' : 'Aún no hay presupuestos'
          }
          description={
            allEstimates.length
              ? 'Elige un periodo más amplio para ver su distribución.'
              : 'Crea el primero para ver su distribución por estado.'
          }
          action={
            <Link to="/presupuestos" className="text-primary underline-offset-4 hover:underline">
              Ir a presupuestos →
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col items-center gap-4 @min-[32rem]:flex-row @min-[32rem]:gap-6">
          <div className="relative flex size-40 shrink-0 items-center justify-center">
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 size-full -rotate-90"
              aria-hidden="true"
            >
              <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" className="stroke-muted" />
              {segments
                .filter((segment) => segment.value > 0)
                .map((segment) => (
                  <circle
                    key={segment.id}
                    cx="50"
                    cy="50"
                    r="42"
                    pathLength="100"
                    fill="none"
                    strokeWidth="8"
                    strokeDasharray={`${segment.value} ${100 - segment.value}`}
                    strokeDashoffset={-segment.offset}
                    className={segment.stroke}
                  />
                ))}
            </svg>
            <div className="relative max-w-28 text-center">
              <p className="text-base leading-tight font-semibold break-words tabular-nums">
                {metric === 'count' ? estimates.length : formatEuros(total)}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {metric === 'count'
                  ? 'presupuestos'
                  : `${estimates.length} ${estimates.length === 1 ? 'presupuesto' : 'presupuestos'}`}
              </p>
            </div>
          </div>
          <ul className="w-full min-w-0 flex-1 space-y-2.5">
            {groups.map((group) => (
              <li key={group.id} className="flex items-center gap-2 text-sm">
                <span
                  className={`${group.color} size-2 shrink-0 rounded-full`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">{statusLabels[group.id]}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {group.count} {group.count === 1 ? 'presupuesto' : 'presupuestos'}
                </span>
                <span className="min-w-20 text-right font-medium tabular-nums">
                  {formatEuros(group.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
