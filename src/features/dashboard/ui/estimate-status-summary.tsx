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

const statuses: { id: EstimateStatus; color: string }[] = [
  { id: 'draft', color: 'bg-muted-foreground' },
  { id: 'sent', color: 'bg-info' },
  { id: 'accepted', color: 'bg-success' },
  { id: 'rejected', color: 'bg-destructive' },
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
  const groups = statuses.map(({ id, color }) => {
    const matching = estimates.filter((estimate) => estimate.status === id)
    return {
      id,
      color,
      count: matching.length,
      amount: matching.reduce((sum, estimate) => sum + estimateTotalCents(estimate), 0),
    }
  })
  const total = groups.reduce((sum, group) => sum + group.amount, 0)
  const chartValue = (group: (typeof groups)[number]) =>
    metric === 'count' ? group.count : Math.max(0, group.amount)
  const chartTotal = groups.reduce((sum, group) => sum + chartValue(group), 0)

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
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-xl font-semibold tabular-nums">{formatEuros(total)}</span>
            <span className="text-muted-foreground text-xs">
              {estimates.length} {estimates.length === 1 ? 'presupuesto' : 'presupuestos'}
            </span>
          </div>
          <div className="bg-muted flex h-2 overflow-hidden rounded-full" aria-hidden="true">
            {chartTotal > 0 &&
              groups.map((group) => (
                <span
                  key={group.id}
                  className={group.color}
                  style={{ width: `${(chartValue(group) / chartTotal) * 100}%` }}
                />
              ))}
          </div>
          <ul className="space-y-2">
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
