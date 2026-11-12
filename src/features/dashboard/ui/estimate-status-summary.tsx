import { Link } from '@tanstack/react-router'

import { estimateTotalCents } from '@/shared/domain/estimate'
import { formatEuros } from '@/shared/domain/money'
import type { Estimate, EstimateStatus } from '@/shared/domain/types'
import { ChartCard, EmptyHint } from '@/shared/ui/charts'
import { fieldIcons } from '@/shared/ui/field-icons'
import { statusLabels } from '@/shared/ui/status-badge'

const statuses: { id: EstimateStatus; color: string }[] = [
  { id: 'draft', color: 'bg-muted-foreground' },
  { id: 'sent', color: 'bg-info' },
  { id: 'accepted', color: 'bg-success' },
  { id: 'rejected', color: 'bg-destructive' },
]

export function EstimateStatusSummary({ estimates }: { estimates: Estimate[] }) {
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
  const chartTotal = groups.reduce((sum, group) => sum + Math.max(0, group.amount), 0)

  return (
    <ChartCard title="Presupuestos por estado">
      {estimates.length === 0 ? (
        <EmptyHint
          icon={fieldIcons.file}
          title="Aún no hay presupuestos"
          description="Crea el primero para ver su distribución por estado."
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
                  style={{ width: `${(Math.max(0, group.amount) / chartTotal) * 100}%` }}
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
    </ChartCard>
  )
}
