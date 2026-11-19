import { Link } from '@tanstack/react-router'

import { categoryChartFormats } from '@/shared/domain/category-chart-format'
import { monthlyChartFormats } from '@/shared/domain/monthly-chart-format'
import { categoryTotals, filterByRecentMonths, monthlySeries } from '@/shared/domain/stats'
import type { Estimate, LedgerEntry } from '@/shared/domain/types'
import { ChartCard } from '@/shared/ui/chart-card'
import {
  chartFormats,
  ChartOptionField,
  ChartPeriodField,
  chartPeriodLabels,
} from '@/shared/ui/chart-settings'
import { ExpenseCategoryPlot } from '@/shared/ui/expense-category-plot'
import { MonthlyChart } from '@/shared/ui/monthly-chart'

import type { DashboardCharts } from '../domain/dashboard-config'
import { EstimateStatusSummary } from './estimate-status-summary'

type OnChange = ((patch: Partial<DashboardCharts>) => void) | undefined

export function DashboardIncomeChart({
  ledger,
  chart,
  onChange,
}: {
  ledger: LedgerEntry[]
  chart: Pick<DashboardCharts, 'incomeChart' | 'incomeMonths'>
  onChange: OnChange
}) {
  const title = 'Ingresos y gastos'
  return (
    <ChartCard
      title={title}
      description={chartPeriodLabels[chart.incomeMonths]}
      settings={
        onChange ? (
          <>
            <ChartOptionField
              label={`Formato de ${title}`}
              names={chartFormats}
              option={{
                value: chart.incomeChart,
                choices: monthlyChartFormats,
                onChange: (incomeChart) => onChange({ incomeChart }),
              }}
            />
            <ChartPeriodField
              title={title}
              option={{
                value: chart.incomeMonths,
                choices: [6, 12],
                onChange: (incomeMonths) => onChange({ incomeMonths }),
              }}
            />
          </>
        ) : null
      }
    >
      <MonthlyChart data={monthlySeries(ledger, chart.incomeMonths)} format={chart.incomeChart} />
    </ChartCard>
  )
}

export function DashboardStatusChart({
  estimates,
  chart,
  onChange,
}: {
  estimates: Estimate[]
  chart: DashboardCharts['estimate-status']
  onChange: OnChange
}) {
  const title = 'Presupuestos por estado'
  return (
    <EstimateStatusSummary
      estimates={estimates}
      months={chart.months}
      metric={chart.metric}
      settings={
        onChange ? (
          <>
            <ChartOptionField
              label={`Medida de ${title}`}
              names={{ amount: 'Por importe', count: 'Por cantidad' }}
              option={{
                value: chart.metric,
                choices: ['amount', 'count'],
                onChange: (metric) => onChange({ 'estimate-status': { ...chart, metric } }),
              }}
            />
            <ChartPeriodField
              title={title}
              option={{
                value: chart.months,
                choices: ['all', 6, 12],
                onChange: (months) => onChange({ 'estimate-status': { ...chart, months } }),
              }}
            />
          </>
        ) : null
      }
    />
  )
}

export function DashboardExpenseChart({
  ledger,
  chart,
  onChange,
}: {
  ledger: LedgerEntry[]
  chart: DashboardCharts['expense-categories']
  onChange: OnChange
}) {
  const title = 'Gastos por categoría'
  return (
    <ChartCard
      title={title}
      description={chartPeriodLabels[chart.months]}
      settings={
        onChange ? (
          <>
            <ChartOptionField
              label={`Formato de ${title}`}
              names={chartFormats}
              option={{
                value: chart.format,
                choices: categoryChartFormats,
                onChange: (format) => onChange({ 'expense-categories': { ...chart, format } }),
              }}
            />
            <ChartPeriodField
              title={title}
              option={{
                value: chart.months,
                choices: [1, 6, 12],
                onChange: (months) => onChange({ 'expense-categories': { ...chart, months } }),
              }}
            />
          </>
        ) : null
      }
    >
      <ExpensePlot ledger={ledger} chart={chart} />
      <Link
        to="/contabilidad"
        className="text-primary mt-3 inline-block text-sm font-medium hover:underline"
      >
        Ver contabilidad →
      </Link>
    </ChartCard>
  )
}

function ExpensePlot({
  ledger,
  chart,
}: {
  ledger: LedgerEntry[]
  chart: DashboardCharts['expense-categories']
}) {
  const entries = filterByRecentMonths(ledger, chart.months, (entry) => entry.date)
  return <ExpenseCategoryPlot items={categoryTotals(entries, 'expense')} format={chart.format} />
}
