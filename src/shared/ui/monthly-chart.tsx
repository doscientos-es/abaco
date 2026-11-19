import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@doscientos/ui'

import { formatEuros } from '@/shared/domain/money'
import type { MonthlyChartFormat } from '@/shared/domain/monthly-chart-format'
import type { MonthPoint } from '@/shared/domain/stats'

import { EmptyHint } from './chart-card'
import { monthlyChartOption, monthlySeriesLegend } from './chart-options'
import { ChartPlot } from './chart-plot'
import { chartFormats } from './chart-settings'
import { fieldIcons } from './field-icons'

export function MonthlyChart({ data, format }: { data: MonthPoint[]; format: MonthlyChartFormat }) {
  if (data.every(({ income, expense }) => income === 0 && expense === 0)) {
    return (
      <EmptyHint
        icon={fieldIcons.bank}
        title="Sin movimientos todavía"
        description="Cuando registres cobros y gastos verás aquí su evolución mes a mes."
      />
    )
  }

  return (
    <figure
      aria-label={`${chartFormats[format]} de ingresos y gastos por mes`}
      className="space-y-2"
    >
      <div className="text-muted-foreground flex justify-end gap-4 text-xs" aria-hidden="true">
        {monthlySeriesLegend.map(({ key, label, color }) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: color }} /> {label}
          </span>
        ))}
      </div>
      <ChartPlot option={monthlyChartOption(data, format)} className="h-52 w-full" />
      <details>
        <summary className="text-muted-foreground w-fit cursor-pointer text-xs">
          Ver datos por mes
        </summary>
        <div className="mt-2">
          <MonthlyTable months={data} />
        </div>
      </details>
    </figure>
  )
}

export function MonthlyTable({ months }: { months: MonthPoint[] }) {
  return (
    <Table aria-label="Ingresos y gastos por mes">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Mes</TableHead>
          {monthlySeriesLegend.map(({ key, label }) => (
            <TableHead key={key} scope="col" className="text-right">
              {label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {months.map((month) => (
          <TableRow key={month.key}>
            <TableHead scope="row">
              {month.label} {month.key.slice(0, 4)}
            </TableHead>
            {monthlySeriesLegend.map(({ key }) => (
              <TableCell key={key} className="text-right tabular-nums">
                {formatEuros(month[key])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
