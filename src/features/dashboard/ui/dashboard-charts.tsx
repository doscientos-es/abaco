import { Link } from '@tanstack/react-router'

import { categoryTotals, filterByRecentMonths, monthlySeries } from '@/shared/domain/stats'
import type { Estimate, LedgerEntry } from '@/shared/domain/types'
import {
  chartFormats,
  ChartOptionField,
  ChartPeriodField,
  chartPeriodLabels,
} from '@/shared/ui/chart-settings'
import { ChartCard, ExpenseCategoryPlot, MonthlyBars } from '@/shared/ui/charts'
import { fieldIcons } from '@/shared/ui/field-icons'
import { MonthlyLines } from '@/shared/ui/monthly-lines'

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
      description={`${chartPeriodLabels[chart.incomeMonths]}. Enfoca un mes para ver el detalle.`}
      settings={
        onChange ? (
          <>
            <ChartOptionField
              label={`Formato de ${title}`}
              names={chartFormats}
              option={{
                value: chart.incomeChart,
                choices: ['bars', 'lines'],
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
      <IncomePlot ledger={ledger} chart={chart} />
    </ChartCard>
  )
}

function IncomePlot({
  ledger,
  chart,
}: {
  ledger: LedgerEntry[]
  chart: Pick<DashboardCharts, 'incomeChart' | 'incomeMonths'>
}) {
  const data = monthlySeries(ledger, chart.incomeMonths)
  return chart.incomeChart === 'lines' ? (
    <MonthlyLines data={data} />
  ) : (
    <MonthlyBars
      data={data}
      emptyIcon={fieldIcons.bank}
      emptyDescription="Cuando registres cobros y gastos verás aquí su evolución mes a mes."
    />
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
                choices: ['donut', 'ranking'],
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
