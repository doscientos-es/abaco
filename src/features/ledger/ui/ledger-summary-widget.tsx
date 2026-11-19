import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@doscientos/ui'
import { DownloadSimple } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'

import { formatEuros } from '@/shared/domain/money'
import { categoryTotals, filterByRecentMonths, type MonthPoint } from '@/shared/domain/stats'
import {
  chartFormats,
  ChartOptionField,
  ChartPeriodField,
  chartPeriodLabels,
} from '@/shared/ui/chart-settings'
import { ChartCard, EmptyHint, ExpenseCategoryPlot, MonthlyBars } from '@/shared/ui/charts'
import { fieldIcons } from '@/shared/ui/field-icons'
import { MonthlyLines } from '@/shared/ui/monthly-lines'
import { StatCard } from '@/shared/ui/stat-card'

import type { ledgerSummaryData } from '../domain/ledger-summary-data'
import {
  ledgerModuleDefinition,
  type LedgerExport,
  type LedgerModule,
} from '../domain/ledger-summary-layout'
import type { LedgerExportAction } from './use-ledger-exports'

const exportDescriptions: Record<LedgerExport, string> = {
  book: 'Libro de ingresos y gastos del periodo seleccionado.',
  vat: 'Resumen de IVA de todos los trimestres registrados.',
  clients: 'Todos los clientes autorizados, sin filtro de mes.',
  invoices: 'Todas las facturas autorizadas, sin filtro de mes.',
  payments: 'Todos los cobros y devoluciones autorizados, sin filtro de mes.',
  expenses: 'Todos los gastos autorizados, sin filtro de mes.',
}

export function LedgerSummaryWidget({
  module,
  data,
  exportAction,
  onChange,
}: {
  module: LedgerModule
  data: ReturnType<typeof ledgerSummaryData>
  exportAction: (id: LedgerExport) => LedgerExportAction
  onChange?: ((patch: Partial<Omit<LedgerModule, 'id'>>) => void) | undefined
}) {
  const definition = ledgerModuleDefinition(module.id)
  const { title } = definition
  if (definition.export) {
    const action = exportAction(definition.export)
    return (
      <ChartCard title={title} description={exportDescriptions[definition.export]}>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Descargar ${title}`}
          isDisabled={action.disabled}
          onPress={action.run}
        >
          <DownloadSimple aria-hidden="true" className="size-4" /> Descargar CSV
        </Button>
      </ChartCard>
    )
  }

  const trend = data.series.slice(-6)
  const result = data.income - data.expenses
  switch (module.id) {
    case 'income':
      return (
        <StatCard
          label={title}
          value={formatEuros(data.income)}
          tone="success"
          icon={fieldIcons.euro}
          trend={trend.map((m) => m.income)}
        />
      )
    case 'expenses':
      return (
        <StatCard
          label={title}
          value={formatEuros(data.expenses)}
          tone="danger"
          icon={fieldIcons.tag}
          trend={trend.map((m) => m.expense)}
        />
      )
    case 'result':
      return (
        <StatCard
          label={title}
          value={formatEuros(result)}
          tone={result < 0 ? 'danger' : 'default'}
          icon={fieldIcons.bank}
          trend={trend.map((m) => m.income - m.expense)}
        />
      )
    case 'vat':
      return (
        <StatCard
          label={title}
          value={formatEuros(data.vat.collected - data.vat.paid)}
          hint={`Repercutido ${formatEuros(data.vat.collected)} · Soportado ${formatEuros(data.vat.paid)}`}
          icon={fieldIcons.percent}
        />
      )
    case 'monthly': {
      const range = module.months === 12 ? 12 : 6
      const months = data.series.slice(-range)
      return (
        <ChartCard
          title={title}
          description={
            data.quarter
              ? 'Los tres meses del trimestre seleccionado.'
              : `Últimos ${months.length} meses.`
          }
          settings={
            onChange ? (
              <LedgerChartControls
                module={module}
                onChange={onChange}
                period={
                  data.quarter ? null : (
                    <ChartPeriodField
                      title={title}
                      option={{
                        value: range,
                        choices: [6, 12],
                        onChange: (months) => onChange({ months }),
                      }}
                    />
                  )
                }
              />
            ) : null
          }
        >
          {module.chart === 'lines' ? (
            <MonthlyLines data={months} />
          ) : module.chart === 'table' ? (
            <MonthlyTable months={months} />
          ) : (
            <MonthlyBars data={months} />
          )}
        </ChartCard>
      )
    }
    case 'categories': {
      const range = module.months ?? 'all'
      return (
        <ChartCard
          title={title}
          description={
            data.quarter ? 'Gastos del trimestre seleccionado.' : chartPeriodLabels[range]
          }
          settings={
            onChange ? (
              <LedgerChartControls
                module={module}
                onChange={onChange}
                period={
                  data.quarter ? null : (
                    <ChartPeriodField
                      title={title}
                      option={{
                        value: range,
                        choices: ['all', 6, 12],
                        onChange: (months) => onChange({ months }),
                      }}
                    />
                  )
                }
              />
            ) : null
          }
        >
          <LedgerExpensePlot
            data={data}
            range={range}
            format={module.chart === 'ranking' ? 'ranking' : 'donut'}
          />
        </ChartCard>
      )
    }
    case 'recent':
      return (
        <ChartCard title={title} description="Últimos cinco movimientos del periodo.">
          {data.entries.length ? (
            <ul className="divide-border divide-y">
              {data.entries.slice(0, 5).map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0 break-words">
                    {entry.concept}
                    <p className="text-muted-foreground text-xs">
                      {entry.date} ·{' '}
                      {entry.kind === 'expense'
                        ? 'Gasto'
                        : entry.amountCents < 0
                          ? 'Reembolso'
                          : 'Ingreso'}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums">{formatEuros(entry.amountCents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint title="No hay apuntes en este periodo" />
          )}
          <Link
            to="/contabilidad"
            search={{ tab: 'apuntes' }}
            className="text-primary mt-2 inline-block text-sm underline underline-offset-4"
          >
            Ver libro de apuntes
          </Link>
        </ChartCard>
      )
    default:
      return null
  }
}

function LedgerChartControls({
  module,
  period,
  onChange,
}: {
  module: LedgerModule
  period: React.ReactNode
  onChange: (patch: Partial<Omit<LedgerModule, 'id'>>) => void
}) {
  const { charts, title } = ledgerModuleDefinition(module.id)
  return (
    <>
      {charts && module.chart ? (
        <ChartOptionField
          label={`Formato de ${title}`}
          names={chartFormats}
          option={{
            value: module.chart,
            choices: charts,
            onChange: (chart) => onChange({ chart }),
          }}
        />
      ) : null}
      {period}
    </>
  )
}

function LedgerExpensePlot({
  data,
  range,
  format,
}: {
  data: ReturnType<typeof ledgerSummaryData>
  range: 'all' | 6 | 12
  format: 'donut' | 'ranking'
}) {
  const entries = data.quarter
    ? data.entries
    : filterByRecentMonths(data.entries, range, (entry) => entry.date)
  return <ExpenseCategoryPlot items={categoryTotals(entries, 'expense')} format={format} />
}

function MonthlyTable({ months }: { months: MonthPoint[] }) {
  return (
    <Table aria-label="Ingresos y gastos por mes">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Mes</TableHead>
          <TableHead scope="col" className="text-right">
            Ingresos
          </TableHead>
          <TableHead scope="col" className="text-right">
            Gastos
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {months.map((month) => (
          <TableRow key={month.key}>
            <TableHead scope="row">
              {month.label} {month.key.slice(0, 4)}
            </TableHead>
            <TableCell className="text-right tabular-nums">{formatEuros(month.income)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatEuros(month.expense)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
