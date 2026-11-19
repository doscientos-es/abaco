import { formatEuros } from '@/shared/domain/money'
import type { MonthPoint } from '@/shared/domain/stats'
import { EmptyHint } from '@/shared/ui/charts'
import { fieldIcons } from '@/shared/ui/field-icons'

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

  const amounts = data.flatMap((month) => [month.income, month.expense])
  const min = Math.min(0, ...amounts)
  const max = Math.max(1, ...amounts)
  const points = (kind: 'income' | 'expense') =>
    data
      .map(
        (month, index) =>
          `${((index + 0.5) / data.length) * 100},${95 - ((month[kind] - min) / (max - min)) * 90}`,
      )
      .join(' ')

  return (
    <div>
      <div className="relative h-44">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="size-full"
          aria-hidden="true"
        >
          <polyline
            points={points('income')}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeWidth="2"
            className="stroke-success"
          />
          <polyline
            points={points('expense')}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeWidth="2"
            className="stroke-destructive"
          />
        </svg>
        <div className="absolute inset-0 flex">
          {data.map((month) => (
            <button
              key={month.key}
              type="button"
              aria-label={`${month.label}: Ingresos ${formatEuros(month.income)}, Gastos ${formatEuros(month.expense)}`}
              className="group focus-visible:ring-ring hover:bg-muted/30 relative flex-1 rounded-md outline-none focus-visible:ring-2"
            >
              <span
                aria-hidden="true"
                className="bg-popover text-popover-foreground border-border pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max -translate-x-1/2 rounded-lg border px-2.5 py-1.5 text-left text-xs shadow-md group-hover:block group-focus-visible:block"
              >
                <span className="block font-medium capitalize">{month.label}</span>
                <span className="text-success block">Ingresos: {formatEuros(month.income)}</span>
                <span className="text-destructive block">Gastos: {formatEuros(month.expense)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex">
        {data.map((month) => (
          <span
            key={month.key}
            className="text-muted-foreground min-w-0 flex-1 truncate text-center text-xs capitalize"
          >
            {month.label}
          </span>
        ))}
      </div>
      <div className="text-muted-foreground mt-3 flex gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <i className="bg-success size-2 rounded-full" />
          Ingresos
        </span>
        <span className="flex items-center gap-1.5">
          <i className="bg-destructive size-2 rounded-full" />
          Gastos
        </span>
      </div>
    </div>
  )
}
