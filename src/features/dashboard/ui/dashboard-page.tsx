import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
} from '@doscientos/ui'
import { Link } from '@tanstack/react-router'

import { estimateTotalCents, paidForEstimate } from '@/shared/domain/estimate'
import { formatEuros } from '@/shared/domain/money'
import { monthlySeries } from '@/shared/domain/stats'
import type { EstimateStatus } from '@/shared/domain/types'
import { useTenantData } from '@/shared/store/store'
import { ChartCard, Donut, EmptyHint, MonthlyBars, type ChartTone } from '@/shared/ui/charts'
import { fieldIcons } from '@/shared/ui/field-icons'
import { StatCard } from '@/shared/ui/stat-card'
import { StatusBadge, statusLabels } from '@/shared/ui/status-badge'

export function DashboardPage() {
  const { estimates, ledger, clients, tenant, invoices } = useTenantData()
  const todayIso = new Date().toISOString().slice(0, 10)
  // Unpaid invoices, the oldest due date first so what is late comes on top.
  const owed = invoices
    .filter((i) => i.status !== 'paid' && i.totalCents > i.paidCents)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const owedTotal = owed.reduce((sum, i) => sum + i.totalCents - i.paidCents, 0)
  const overdueTotal = owed
    .filter((i) => i.dueDate < todayIso)
    .reduce((sum, i) => sum + i.totalCents - i.paidCents, 0)
  const open = estimates.filter((e) => e.status === 'sent')
  const accepted = estimates.filter((e) => e.status === 'accepted')
  const pendingCollection = accepted.reduce(
    (sum, e) => sum + Math.max(0, estimateTotalCents(e) - paidForEstimate(e.id, ledger)),
    0,
  )
  const sentTotal = open.reduce((sum, e) => sum + estimateTotalCents(e), 0)
  const decided = estimates.filter((e) => e.status === 'accepted' || e.status === 'rejected')
  const winRate = decided.length ? Math.round((accepted.length / decided.length) * 100) : 0
  const months = monthlySeries(ledger)
  const statusTones: Record<EstimateStatus, ChartTone> = {
    draft: 'muted',
    sent: 'info',
    accepted: 'success',
    rejected: 'danger',
  }
  const byStatus = (Object.keys(statusLabels) as EstimateStatus[]).map((status) => ({
    label: statusLabels[status],
    tone: statusTones[status],
    value: estimates.filter((e) => e.status === status).reduce((sum, e) => sum + estimateTotalCents(e), 0),
  }))

  return (
    <div className="space-y-8">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Hola, {tenant.name}</PageHeaderTitle>
          <PageHeaderDescription>Así van tus presupuestos y cobros.</PageHeaderDescription>
        </PageHeaderHeading>
        <PageHeaderActions>
          <Link
            to="/presupuestos"
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-colors"
          >
            Ver presupuestos
          </Link>
        </PageHeaderActions>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pendiente de respuesta"
          value={formatEuros(sentTotal)}
          hint={`${open.length} presupuestos enviados`}
          tone="info"
          icon={fieldIcons.file}
        />
        <StatCard
          label="Pendiente de cobro"
          value={formatEuros(pendingCollection)}
          hint="De presupuestos aceptados"
          tone="warning"
          icon={fieldIcons.euro}
        />
        <StatCard
          label="Cobrado este mes"
          value={formatEuros(months.at(-1)?.income ?? 0)}
          hint={`Gastos ${formatEuros(months.at(-1)?.expense ?? 0)}`}
          tone="success"
          icon={fieldIcons.bank}
          trend={months.map((m) => m.income)}
        />
        <StatCard
          label="Tasa de aceptación"
          value={`${winRate}%`}
          hint={`${decided.length} resueltos · ${clients.length} clientes`}
          icon={fieldIcons.percent}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title="Ingresos y gastos"
          description="Últimos 6 meses. Pasa el ratón por un mes para ver el detalle."
        >
          <MonthlyBars
            data={months}
            emptyIcon={fieldIcons.bank}
            emptyDescription="Cuando registres cobros y gastos verás aquí su evolución mes a mes."
          />
        </ChartCard>
        <ChartCard className="lg:col-span-2" title="Presupuestos por estado" description="Importe total de cada grupo.">
          <Donut
            data={byStatus}
            centerLabel="Total"
            empty="Aún no hay presupuestos"
            emptyDescription="Crea el primero y verás cuánto hay en borrador, enviado, aceptado o rechazado."
            emptyIcon={fieldIcons.file}
            emptyAction={
              <Link to="/presupuestos" className="text-primary underline-offset-4 hover:underline">
                Ir a presupuestos →
              </Link>
            }
          />
        </ChartCard>
      </div>

      {owed.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader className="border-border flex-row items-center justify-between border-b pb-4">
            <div>
              <CardTitle>Qué me deben</CardTitle>
              <p className="text-muted-foreground text-xs">
                {formatEuros(owedTotal)} por cobrar
                {overdueTotal > 0 ? ` · ${formatEuros(overdueTotal)} vencido` : ''}
              </p>
            </div>
            <Link
              to="/facturas"
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              Ver facturas →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {owed.slice(0, 5).map((invoice) => {
              const late = invoice.dueDate < todayIso
              return (
                <Link
                  key={invoice.id}
                  to="/facturas/$invoiceId"
                  params={{ invoiceId: invoice.id }}
                  className="border-border hover:bg-muted/60 flex items-center justify-between gap-4 border-t px-6 py-3.5 text-sm transition-colors first:border-t-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {clients.find((c) => c.id === invoice.clientId)?.name ?? 'Sin cliente'}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {invoice.number} · {invoice.concept}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="block font-medium">{formatEuros(invoice.totalCents - invoice.paidCents)}</span>
                    <span className={late ? 'text-destructive block text-xs font-medium' : 'text-muted-foreground block text-xs'}>
                      {late ? `Vencida el ${invoice.dueDate}` : `Vence el ${invoice.dueDate}`}
                    </span>
                  </span>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader className="border-border flex-row items-center justify-between border-b pb-4">
          <CardTitle>Últimos presupuestos</CardTitle>
          <Link
            to="/presupuestos"
            className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
          >
            Ver todos →
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {estimates.slice(0, 5).map((estimate) => (
            <Link
              key={estimate.id}
              to="/presupuestos/$estimateId"
              params={{ estimateId: estimate.id }}
              className="border-border hover:bg-muted/60 flex items-center justify-between gap-4 border-t px-6 py-3.5 text-sm transition-colors first:border-t-0"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{estimate.title}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {estimate.number} · {clients.find((c) => c.id === estimate.clientId)?.name ?? 'Sin cliente'}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-4 tabular-nums">
                <span className="font-medium">{formatEuros(estimateTotalCents(estimate))}</span>
                <StatusBadge status={estimate.status} />
              </span>
            </Link>
          ))}
          {estimates.length === 0 ? (
            <EmptyHint
              className="py-12"
              icon={fieldIcons.file}
              title="Todavía no has creado presupuestos"
              description="Tus cinco últimos presupuestos aparecerán aquí, con su importe y estado."
              action={
                <Link to="/presupuestos" className="text-primary underline-offset-4 hover:underline">
                  Crear el primero →
                </Link>
              }
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
