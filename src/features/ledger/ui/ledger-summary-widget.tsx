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
import type { MonthPoint } from '@/shared/domain/stats'
import { ChartCard, Donut, EmptyHint, MonthlyBars } from '@/shared/ui/charts'
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
}: {
  module: LedgerModule
  data: ReturnType<typeof ledgerSummaryData>
  exportAction: (id: LedgerExport) => LedgerExportAction
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

  const months = data.series.slice(-(module.months ?? 6))
  const result = data.income - data.expenses
  switch (module.id) {
    case 'income':
      return (
        <StatCard
          label={title}
          value={formatEuros(data.income)}
          tone="success"
          icon={fieldIcons.euro}
          trend={months.map((m) => m.income)}
        />
      )
    case 'expenses':
      return (
        <StatCard
          label={title}
          value={formatEuros(data.expenses)}
          tone="danger"
          icon={fieldIcons.tag}
          trend={months.map((m) => m.expense)}
        />
      )
    case 'result':
      return (
        <StatCard
          label={title}
          value={formatEuros(result)}
          tone={result < 0 ? 'danger' : 'default'}
          icon={fieldIcons.bank}
          trend={months.map((m) => m.income - m.expense)}
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
    case 'monthly':
      return (
        <ChartCard
          title={title}
          description={
            data.quarter
              ? 'Los tres meses del trimestre seleccionado.'
              : `Últimos ${months.length} meses.`
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
    case 'categories':
      return (
        <ChartCard
          title={title}
          description={
            data.quarter ? 'Gastos del trimestre seleccionado.' : 'Gastos de todos los periodos.'
          }
        >
          {module.chart === 'ranking' ? (
            <CategoryRanking items={data.categories} />
          ) : (
            <Donut
              data={data.categories}
              centerLabel="Gastos"
              empty="Aún no hay gastos"
              emptyDescription="Al registrar gastos verás cuánto se va en cada categoría."
              emptyIcon={fieldIcons.euro}
            />
          )}
        </ChartCard>
      )
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

function CategoryRanking({ items }: { items: ReturnType<typeof ledgerSummaryData>['categories'] }) {
  if (!items.length) return <EmptyHint title="Aún no hay gastos" />
  const max = Math.max(1, ...items.map(({ value }) => Math.abs(value)))
  return (
    <ul className="space-y-2">
      {items.map(({ label, value }, index) => (
        <li key={`${label}-${index}`} className="space-y-1">
          <div className="flex justify-between gap-2 text-sm">
            <span className="min-w-0 break-words">{label}</span>
            <span className="shrink-0 tabular-nums">{formatEuros(value)}</span>
          </div>
          <div aria-hidden="true" className="bg-muted h-2 rounded-full">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${(Math.abs(value) / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
