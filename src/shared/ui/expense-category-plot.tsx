import type { CategoryChartFormat } from '@/shared/domain/category-chart-format'
import { formatEuros } from '@/shared/domain/money'

import { EmptyHint } from './chart-card'
import { categoryChartOption, categoryColor, type CategoryAmount } from './chart-options'
import { ChartPlot } from './chart-plot'
import { chartFormats } from './chart-settings'
import { fieldIcons } from './field-icons'

export function ExpenseCategoryPlot({
  items,
  format,
}: {
  items: CategoryAmount[]
  format: CategoryChartFormat
}) {
  const ranking = format === 'ranking'
  const plotted = ranking ? items : items.filter(({ value }) => value > 0)
  if (!plotted.length) {
    return (
      <EmptyHint
        title="Aún no hay gastos en este periodo"
        description="Al registrar gastos verás cuánto se va en cada categoría."
        icon={fieldIcons.euro}
      />
    )
  }

  const total = plotted.reduce((sum, { value }) => sum + value, 0)
  const legend = (
    <ul className="w-full min-w-0 flex-1 space-y-2">
      {plotted.map(({ label, value }, index) => (
        <li key={`${label}-${index}`} className="flex items-baseline gap-2 text-xs">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor(index) }}
          />
          <span className="min-w-0 flex-1 break-words">{label}</span>
          <span className="shrink-0 tabular-nums">{formatEuros(value)}</span>
          {format === 'radial' ? (
            <span className="text-muted-foreground w-9 shrink-0 text-right tabular-nums">
              {Math.round((value / total) * 100)} %
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
  const option = categoryChartOption(plotted, format)

  return (
    <figure className="@container" aria-label={`${chartFormats[format]} de gastos por categoría`}>
      {ranking ? (
        <div className="space-y-2">
          <ChartPlot option={option} className="h-48 w-full" />
          <details>
            <summary className="text-muted-foreground mb-2 w-fit cursor-pointer text-xs">
              Ver importes por categoría
            </summary>
            {legend}
          </details>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 @min-[26rem]:flex-row">
          <div className="relative shrink-0">
            <ChartPlot option={option} className="size-40" />
            {format !== 'pie' ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-xs">
                <span className="text-muted-foreground">Gastos</span>
                <span
                  className="max-w-20 truncate font-semibold tabular-nums"
                  title={formatEuros(total)}
                >
                  {formatEuros(total)}
                </span>
              </div>
            ) : null}
          </div>
          {legend}
        </div>
      )}
    </figure>
  )
}
