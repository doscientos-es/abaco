import { Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import { WarningCircle } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { can, useSession } from '@/features/auth'
import { saveDashboardConfig } from '@/features/dashboard/application/dashboard-actions'
import { estimateTotalCents, paidForEstimate } from '@/shared/domain/estimate'
import { formatEuros } from '@/shared/domain/money'
import { monthlySeries } from '@/shared/domain/stats'
import type { TenantData } from '@/shared/domain/types'
import { useSaveStatus, useTenantData } from '@/shared/store/store'
import { EmptyHint } from '@/shared/ui/chart-card'
import { DashboardLayoutEditor, DashboardPageHeading } from '@/shared/ui/dashboard-layout-editor'
import { fieldIcons } from '@/shared/ui/field-icons'
import { StatCard } from '@/shared/ui/stat-card'
import { StatusBadge } from '@/shared/ui/status-badge'
import { useDashboardLayout } from '@/shared/ui/use-dashboard-layout'

import {
  dashboardConfigFrom,
  dashboardWidgets,
  newDashboardWidget,
  resolveDashboardLayout,
  type DashboardCharts,
  type DashboardWidgetId,
} from '../domain/dashboard-config'
import {
  DashboardExpenseChart,
  DashboardIncomeChart,
  DashboardStatusChart,
} from './dashboard-charts'

export function DashboardPage() {
  const data = useTenantData()
  return <DashboardContent key={data.tenant.id} tenantData={data} />
}

function DashboardContent({
  tenantData: { estimates, ledger, clients, tenant, invoices },
}: {
  tenantData: TenantData
}) {
  const session = useSession()
  const saveStatus = useSaveStatus()
  const editor = useDashboardLayout({
    saved: resolveDashboardLayout(tenant.dashboardConfig),
    defaults: resolveDashboardLayout,
    createModule: newDashboardWidget,
    onSave: (layout) => saveDashboardConfig(dashboardConfigFrom(layout)),
    enabled: can(session?.role, 'settings:write'),
  })

  const todayIso = new Date().toISOString().slice(0, 10)
  const owed = invoices
    .filter((invoice) => invoice.status !== 'paid' && invoice.totalCents > invoice.paidCents)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const owedTotal = owed.reduce((sum, invoice) => sum + invoice.totalCents - invoice.paidCents, 0)
  const overdue = owed.filter((invoice) => invoice.dueDate < todayIso)
  const overdueTotal = overdue.reduce(
    (sum, invoice) => sum + invoice.totalCents - invoice.paidCents,
    0,
  )
  const open = estimates.filter((estimate) => estimate.status === 'sent')
  const accepted = estimates.filter((estimate) => estimate.status === 'accepted')
  const pendingCollection = accepted.reduce(
    (sum, estimate) =>
      sum + Math.max(0, estimateTotalCents(estimate) - paidForEstimate(estimate.id, ledger)),
    0,
  )
  const sentTotal = open.reduce((sum, estimate) => sum + estimateTotalCents(estimate), 0)
  const decided = estimates.filter(
    (estimate) => estimate.status === 'accepted' || estimate.status === 'rejected',
  )
  const winRate = decided.length ? Math.round((accepted.length / decided.length) * 100) : 0
  const data = {
    estimates,
    ledger,
    clients,
    owed,
    owedTotal,
    overdueTotal,
    overdueCount: overdue.length,
    sentTotal,
    open,
    pendingCollection,
    winRate,
    decided,
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <DashboardPageHeading
        title={<>Hola, {tenant.name}</>}
        editor={editor}
        actions={
          <Link
            to="/presupuestos"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex max-md:min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-colors"
          >
            Ver presupuestos
          </Link>
        }
      />

      {data.overdueCount > 0 ? (
        <Link
          to="/facturas"
          aria-label={`${data.overdueCount} ${
            data.overdueCount === 1 ? 'factura vencida' : 'facturas vencidas'
          }, ${formatEuros(data.overdueTotal)} pendientes. Revisar facturas`}
          className="border-destructive/30 bg-destructive/5 hover:bg-destructive/10 focus-visible:ring-ring flex min-h-12 items-center gap-3 rounded-xl border px-4 py-3 outline-none transition-colors focus-visible:ring-2"
        >
          <WarningCircle aria-hidden="true" className="text-destructive size-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {data.overdueCount}{' '}
              {data.overdueCount === 1 ? 'factura vencida' : 'facturas vencidas'}
            </span>
            <span className="text-muted-foreground block text-xs max-md:text-[0.8125rem]">
              Revisa los cobros pendientes
            </span>
          </span>
          <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
            {formatEuros(data.overdueTotal)}
          </span>
        </Link>
      ) : null}

      <DashboardLayoutEditor
        label="Bloques del resumen"
        editor={editor}
        options={dashboardWidgets}
        notice={
          saveStatus.state === 'saving'
            ? 'Guardando tu resumen…'
            : saveStatus.state === 'error'
              ? 'No se pudo guardar el resumen. Revisa el aviso superior.'
              : 'Resumen actualizado.'
        }
        renderModule={({ id }) => (
          <DashboardWidget
            id={id}
            data={data}
            charts={editor.layout.charts}
            editing={editor.editing}
            onChartChange={
              editor.editing
                ? (patch) =>
                    editor.update((current) => ({
                      ...current,
                      charts: { ...current.charts, ...patch },
                    }))
                : undefined
            }
          />
        )}
      />
    </div>
  )
}

type DashboardData = {
  estimates: TenantData['estimates']
  ledger: TenantData['ledger']
  clients: TenantData['clients']
  owed: TenantData['invoices']
  owedTotal: number
  overdueTotal: number
  overdueCount: number
  sentTotal: number
  open: TenantData['estimates']
  pendingCollection: number
  winRate: number
  decided: TenantData['estimates']
}

function DashboardMetric({
  to,
  detail,
  editing,
  children,
}: {
  to: '/presupuestos' | '/contabilidad'
  detail: string
  editing: boolean
  children: ReactNode
}) {
  if (editing) return <div>{children}</div>
  return (
    <Link
      to={to}
      title={detail}
      className="focus-visible:ring-ring block h-full rounded-xl transition-shadow outline-none hover:shadow-sm focus-visible:ring-2"
    >
      {children}
      <span className="sr-only">{detail}</span>
    </Link>
  )
}

function DashboardWidget({
  id,
  data,
  charts,
  editing,
  onChartChange,
}: {
  id: DashboardWidgetId
  data: DashboardData
  charts: DashboardCharts
  editing: boolean
  onChartChange: ((patch: Partial<DashboardCharts>) => void) | undefined
}) {
  switch (id) {
    case 'key-metrics': {
      const months = monthlySeries(data.ledger)
      return (
        <div className="dashboard-key-metrics grid grid-cols-2 gap-2.5 @lg:grid-cols-2 @4xl:grid-cols-4 md:gap-3">
          <DashboardMetric
            to="/presupuestos"
            editing={editing}
            detail="Pendiente de respuesta: importe de presupuestos enviados. Ver presupuestos"
          >
            <StatCard
              label="Pendiente de respuesta"
              value={formatEuros(data.sentTotal)}
              hint={`${data.open.length} presupuestos enviados`}
              tone="info"
              icon={fieldIcons.file}
              variant="dashboard"
            />
          </DashboardMetric>
          <DashboardMetric
            to="/presupuestos"
            editing={editing}
            detail="Pendiente de cobro: importe restante de presupuestos aceptados. Ver presupuestos"
          >
            <StatCard
              label="Pendiente de cobro"
              value={formatEuros(data.pendingCollection)}
              hint="De presupuestos aceptados"
              tone="warning"
              icon={fieldIcons.euro}
              variant="dashboard"
            />
          </DashboardMetric>
          <DashboardMetric
            to="/contabilidad"
            editing={editing}
            detail="Cobrado este mes: ingresos registrados en contabilidad. Ver contabilidad"
          >
            <StatCard
              label="Cobrado este mes"
              value={formatEuros(months.at(-1)?.income ?? 0)}
              hint={`Gastos ${formatEuros(months.at(-1)?.expense ?? 0)}`}
              tone="success"
              icon={fieldIcons.bank}
              trend={months.map((month) => month.income)}
              variant="dashboard"
            />
          </DashboardMetric>
          <DashboardMetric
            to="/presupuestos"
            editing={editing}
            detail="Tasa de aceptación: aceptados entre presupuestos aceptados o rechazados. Ver presupuestos"
          >
            <StatCard
              label="Tasa de aceptación"
              value={`${data.winRate}%`}
              hint={`${data.decided.length} resueltos · ${data.clients.length} clientes`}
              icon={fieldIcons.percent}
              variant="dashboard"
            />
          </DashboardMetric>
        </div>
      )
    }
    case 'income-expenses':
      return <DashboardIncomeChart ledger={data.ledger} chart={charts} onChange={onChartChange} />
    case 'estimate-status':
      return (
        <DashboardStatusChart
          estimates={data.estimates}
          chart={charts['estimate-status']}
          onChange={onChartChange}
        />
      )
    case 'receivables':
      return (
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle>Facturas por cobrar</CardTitle>
              <p className="text-muted-foreground text-xs">
                {formatEuros(data.owedTotal)} por cobrar
                {data.overdueTotal > 0 ? ` · ${formatEuros(data.overdueTotal)} vencido` : ''}
              </p>
            </div>
            <Link
              to="/facturas"
              className="text-muted-foreground hover:text-foreground inline-flex max-md:min-h-11 items-center text-sm font-medium"
            >
              Ver facturas →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {data.owed.length ? (
              data.owed.slice(0, 5).map((invoice) => {
                const late = invoice.dueDate < new Date().toISOString().slice(0, 10)
                return (
                  <Link
                    key={invoice.id}
                    to="/facturas/$invoiceId"
                    params={{ invoiceId: invoice.id }}
                    className="border-border hover:bg-muted/60 flex items-start justify-between gap-2 border-t px-4 py-3.5 text-sm first:border-t-0 md:items-center md:gap-4 md:px-6"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {data.clients.find((client) => client.id === invoice.clientId)?.name ??
                          'Sin cliente'}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs max-md:text-[0.8125rem]">
                        {invoice.number} · {invoice.concept}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block font-medium">
                        {formatEuros(invoice.totalCents - invoice.paidCents)}
                      </span>
                      <span
                        className={
                          late
                            ? 'text-destructive block text-xs font-medium'
                            : 'text-muted-foreground block text-xs'
                        }
                      >
                        {late ? `Vencida el ${invoice.dueDate}` : `Vence el ${invoice.dueDate}`}
                      </span>
                    </span>
                  </Link>
                )
              })
            ) : (
              <EmptyHint
                className="py-8"
                icon={fieldIcons.euro}
                title="No hay cobros pendientes"
                description="Las facturas abiertas aparecerán aquí."
              />
            )}
          </CardContent>
        </Card>
      )
    case 'recent-estimates':
      return (
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
            <CardTitle>Presupuestos recientes</CardTitle>
            <Link
              to="/presupuestos"
              className="text-muted-foreground hover:text-foreground inline-flex max-md:min-h-11 items-center text-sm font-medium"
            >
              Ver todos →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {data.estimates.slice(0, 5).map((estimate) => (
              <Link
                key={estimate.id}
                to="/presupuestos/$estimateId"
                params={{ estimateId: estimate.id }}
                className="border-border hover:bg-muted/60 flex items-start justify-between gap-2 border-t px-4 py-3.5 text-sm first:border-t-0 md:items-center md:gap-4 md:px-6"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{estimate.title}</span>
                  <span className="text-muted-foreground block truncate text-xs max-md:text-[0.8125rem]">
                    {estimate.number} ·{' '}
                    {data.clients.find((client) => client.id === estimate.clientId)?.name ??
                      'Sin cliente'}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 tabular-nums md:flex-row md:items-center md:gap-4">
                  <span className="font-medium">{formatEuros(estimateTotalCents(estimate))}</span>
                  <StatusBadge status={estimate.status} />
                </span>
              </Link>
            ))}
            {data.estimates.length === 0 ? (
              <EmptyHint
                className="py-12"
                icon={fieldIcons.file}
                title="Todavía no has creado presupuestos"
                description="Tus cinco últimos presupuestos aparecerán aquí, con su importe y estado."
                action={
                  <Link
                    to="/presupuestos"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Crear el primero →
                  </Link>
                }
              />
            ) : null}
          </CardContent>
        </Card>
      )
    case 'clients': {
      const activeClients = data.clients.filter((client) => !client.archivedAt).length
      return (
        <Card>
          <CardHeader>
            <CardTitle>Clientes</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-semibold tabular-nums">{activeClients}</p>
              <p className="text-muted-foreground text-xs">clientes activos</p>
            </div>
            <Link
              to="/clientes"
              className="text-primary inline-flex max-md:min-h-11 items-center text-sm font-medium hover:underline"
            >
              Ver clientes →
            </Link>
          </CardContent>
        </Card>
      )
    }
    case 'expense-categories':
      return (
        <DashboardExpenseChart
          ledger={data.ledger}
          chart={charts['expense-categories']}
          onChange={onChartChange}
        />
      )
    case 'recent-movements': {
      const recent = [...data.ledger].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
      return (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Movimientos recientes</CardTitle>
            <Link
              to="/contabilidad"
              search={{ tab: 'apuntes' }}
              className="text-primary inline-flex max-md:min-h-11 items-center text-sm font-medium hover:underline"
            >
              Ver apuntes →
            </Link>
          </CardHeader>
          <CardContent>
            {recent.length ? (
              <ul className="space-y-3">
                {recent.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{entry.concept}</span>
                      <span className="text-muted-foreground block text-xs">
                        {entry.date} · {entry.kind === 'income' ? 'Ingreso' : 'Gasto'}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {entry.kind === 'income' ? '+' : '−'}
                      {formatEuros(entry.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyHint
                icon={fieldIcons.bank}
                title="Aún no hay movimientos"
                description="Los últimos cobros y gastos aparecerán aquí."
              />
            )}
          </CardContent>
        </Card>
      )
    }
    default: {
      const exhaustiveCheck: never = id
      return exhaustiveCheck
    }
  }
}
