import { DragDropProvider } from '@dnd-kit/react'
import { isSortable } from '@dnd-kit/react/sortable'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@doscientos/ui'
import { ArrowCounterClockwise, Check, Plus, SlidersHorizontal, X } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useMemo, useState, type ComponentProps } from 'react'

import { can, useSession } from '@/features/auth'
import { saveDashboardConfig } from '@/features/dashboard/application/dashboard-actions'
import { estimateTotalCents, paidForEstimate } from '@/shared/domain/estimate'
import { formatEuros } from '@/shared/domain/money'
import { monthlySeries } from '@/shared/domain/stats'
import type { DashboardConfig, TenantData } from '@/shared/domain/types'
import { useSaveStatus, useTenantData } from '@/shared/store/store'
import { ChartCard, EmptyHint, MonthlyBars } from '@/shared/ui/charts'
import { fieldIcons } from '@/shared/ui/field-icons'
import { StatCard } from '@/shared/ui/stat-card'
import { StatusBadge } from '@/shared/ui/status-badge'
import { WorkspacePageHeading } from '@/shared/ui/workspace-page-chrome'

import {
  dashboardWidgets,
  defaultDashboardWidgets,
  moveDashboardWidget,
  resolveDashboardWidgets,
  type DashboardWidgetId,
} from '../domain/dashboard-config'
import { EstimateStatusSummary } from './estimate-status-summary'
import { SortableDashboardWidget } from './sortable-dashboard-widget'

export function DashboardPage() {
  const { estimates, ledger, clients, tenant, invoices } = useTenantData()
  const session = useSession()
  const saveStatus = useSaveStatus()
  const canCustomize = can(session?.role, 'settings:write')
  const savedWidgets = useMemo(
    () => resolveDashboardWidgets(tenant.dashboardConfig),
    [tenant.dashboardConfig],
  )
  const [editing, setEditing] = useState(false)
  const [draftWidgets, setDraftWidgets] = useState<DashboardWidgetId[]>([])
  const [justSaved, setJustSaved] = useState(false)

  const todayIso = new Date().toISOString().slice(0, 10)
  const owed = invoices
    .filter((invoice) => invoice.status !== 'paid' && invoice.totalCents > invoice.paidCents)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const owedTotal = owed.reduce((sum, invoice) => sum + invoice.totalCents - invoice.paidCents, 0)
  const overdueTotal = owed
    .filter((invoice) => invoice.dueDate < todayIso)
    .reduce((sum, invoice) => sum + invoice.totalCents - invoice.paidCents, 0)
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
  const months = monthlySeries(ledger)
  const data = {
    estimates,
    ledger,
    clients,
    invoices,
    owed,
    owedTotal,
    overdueTotal,
    months,
    sentTotal,
    open,
    pendingCollection,
    winRate,
    decided,
  }
  const savedConfig = JSON.stringify(savedWidgets)
  const draftConfig = JSON.stringify(draftWidgets)
  const dirty = savedConfig !== draftConfig
  const availableWidgets = dashboardWidgets.filter((widget) => !draftWidgets.includes(widget.id))
  const visibleWidgets = editing ? draftWidgets : savedWidgets

  function startEditing() {
    setDraftWidgets(savedWidgets)
    setJustSaved(false)
    setEditing(true)
  }

  function cancelEditing() {
    setDraftWidgets(savedWidgets)
    setJustSaved(false)
    setEditing(false)
  }

  function saveLayout() {
    const config: DashboardConfig = { version: 1, widgets: draftWidgets }
    saveDashboardConfig(config)
    setEditing(false)
    setJustSaved(true)
  }

  function removeWidget(id: DashboardWidgetId) {
    setDraftWidgets((widgets) => widgets.filter((widget) => widget !== id))
    setJustSaved(false)
  }

  function addWidget(id: DashboardWidgetId) {
    setDraftWidgets((widgets) => (widgets.includes(id) ? widgets : [...widgets, id]))
    setJustSaved(false)
  }

  function handleDragEnd(
    event: Parameters<NonNullable<ComponentProps<typeof DragDropProvider>['onDragEnd']>>[0],
  ) {
    if (event.canceled || !isSortable(event.operation.source)) return
    const { initialIndex, index } = event.operation.source
    if (initialIndex === index) return
    setDraftWidgets((widgets) => moveDashboardWidget(widgets, initialIndex, index))
    setJustSaved(false)
  }

  return (
    <div className="space-y-6">
      <WorkspacePageHeading
        title={<>Hola, {tenant.name}</>}
        actions={
          <>
            <Link
              to="/presupuestos"
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-colors"
            >
              Ver presupuestos
            </Link>
            {canCustomize ? (
              editing ? (
                <>
                  <Button variant="outline" onPress={cancelEditing}>
                    <X aria-hidden="true" className="mr-2 size-4" />
                    Cancelar
                  </Button>
                  <Button isDisabled={!dirty} onPress={saveLayout}>
                    <Check aria-hidden="true" className="mr-2 size-4" />
                    Guardar
                  </Button>
                </>
              ) : (
                <Button variant="outline" onPress={startEditing}>
                  <SlidersHorizontal aria-hidden="true" className="mr-2 size-4" />
                  Personalizar
                </Button>
              )
            ) : null}
          </>
        }
      />

      {editing ? (
        <section
          className="border-border bg-muted/40 space-y-4 rounded-xl border p-4 sm:p-5"
          aria-label="Editor del resumen"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Organiza tu resumen</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Arrastra los bloques para ordenarlos. En teclado, enfoca el control de arrastre y
                usa espacio y flechas.
              </p>
            </div>
            <Button
              variant="ghost"
              isDisabled={JSON.stringify(draftWidgets) === JSON.stringify(defaultDashboardWidgets)}
              onPress={() => {
                setDraftWidgets([...defaultDashboardWidgets])
                setJustSaved(false)
              }}
            >
              <ArrowCounterClockwise aria-hidden="true" className="mr-2 size-4" />
              Restaurar predeterminado
            </Button>
          </div>
          {availableWidgets.length ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold">Añadir bloques</h3>
              <div className="flex flex-wrap gap-2">
                {availableWidgets.map((widget) => (
                  <button
                    key={widget.id}
                    type="button"
                    onClick={() => addWidget(widget.id)}
                    className="border-border bg-background hover:bg-muted flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs"
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    <span className="flex flex-col items-start">
                      <span className="font-medium">{widget.title}</span>
                      <span className="text-muted-foreground text-[11px]">
                        {widget.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {justSaved ? (
        <output className="text-muted-foreground block text-xs" aria-live="polite">
          {saveStatus.state === 'saving'
            ? 'Guardando tu resumen…'
            : saveStatus.state === 'error'
              ? 'No se pudo guardar el resumen. Revisa el aviso superior.'
              : 'Resumen actualizado.'}
        </output>
      ) : null}

      {visibleWidgets.length ? (
        <DragDropProvider onDragEnd={handleDragEnd}>
          <section className="grid gap-x-4 gap-y-6 md:grid-cols-2" aria-label="Bloques del resumen">
            {visibleWidgets.map((id, index) => {
              const widget = dashboardWidgets.find((item) => item.id === id)
              if (!widget) return null
              const fullWidth = ['key-metrics', 'receivables', 'recent-estimates'].includes(id)
              return (
                <SortableDashboardWidget
                  key={id}
                  id={id}
                  index={index}
                  title={widget.title}
                  fullWidth={fullWidth}
                  editing={editing}
                  onRemove={removeWidget}
                >
                  <DashboardWidget id={id} data={data} />
                </SortableDashboardWidget>
              )
            })}
          </section>
        </DragDropProvider>
      ) : (
        <div className="border-border bg-card rounded-xl border border-dashed px-5 py-12 text-center">
          <h2 className="text-base font-semibold">Tu resumen está vacío</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {canCustomize
              ? 'Personaliza el resumen y añade los bloques que te interesan.'
              : 'Pide a un administrador que configure los bloques del resumen.'}
          </p>
          {canCustomize && !editing ? (
            <Button className="mt-4" onPress={startEditing}>
              Personalizar resumen
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}

type DashboardData = {
  estimates: TenantData['estimates']
  ledger: TenantData['ledger']
  clients: TenantData['clients']
  invoices: TenantData['invoices']
  owed: TenantData['invoices']
  owedTotal: number
  overdueTotal: number
  months: ReturnType<typeof monthlySeries>
  sentTotal: number
  open: TenantData['estimates']
  pendingCollection: number
  winRate: number
  decided: TenantData['estimates']
}

function DashboardWidget({ id, data }: { id: DashboardWidgetId; data: DashboardData }) {
  switch (id) {
    case 'key-metrics':
      return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Pendiente de respuesta"
            value={formatEuros(data.sentTotal)}
            hint={`${data.open.length} presupuestos enviados`}
            tone="info"
            icon={fieldIcons.file}
          />
          <StatCard
            label="Pendiente de cobro"
            value={formatEuros(data.pendingCollection)}
            hint="De presupuestos aceptados"
            tone="warning"
            icon={fieldIcons.euro}
          />
          <StatCard
            label="Cobrado este mes"
            value={formatEuros(data.months.at(-1)?.income ?? 0)}
            hint={`Gastos ${formatEuros(data.months.at(-1)?.expense ?? 0)}`}
            tone="success"
            icon={fieldIcons.bank}
            trend={data.months.map((month) => month.income)}
          />
          <StatCard
            label="Tasa de aceptación"
            value={`${data.winRate}%`}
            hint={`${data.decided.length} resueltos · ${data.clients.length} clientes`}
            icon={fieldIcons.percent}
          />
        </div>
      )
    case 'income-expenses':
      return (
        <ChartCard
          title="Ingresos y gastos"
          description="Últimos 6 meses. Pasa el ratón por un mes para ver el detalle."
        >
          <MonthlyBars
            data={data.months}
            emptyIcon={fieldIcons.bank}
            emptyDescription="Cuando registres cobros y gastos verás aquí su evolución mes a mes."
          />
        </ChartCard>
      )
    case 'estimate-status':
      return <EstimateStatusSummary estimates={data.estimates} />
    case 'receivables':
      return (
        <Card className="overflow-hidden">
          <CardHeader className="border-border flex-row items-center justify-between border-b pb-4">
            <div>
              <CardTitle>Qué me deben</CardTitle>
              <p className="text-muted-foreground text-xs">
                {formatEuros(data.owedTotal)} por cobrar
                {data.overdueTotal > 0 ? ` · ${formatEuros(data.overdueTotal)} vencido` : ''}
              </p>
            </div>
            <Link
              to="/facturas"
              className="text-muted-foreground hover:text-foreground text-sm font-medium"
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
                    className="border-border hover:bg-muted/60 flex items-center justify-between gap-4 border-t px-6 py-3.5 text-sm first:border-t-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {data.clients.find((client) => client.id === invoice.clientId)?.name ??
                          'Sin cliente'}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
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
          <CardHeader className="border-border flex-row items-center justify-between border-b pb-4">
            <CardTitle>Últimos presupuestos</CardTitle>
            <Link
              to="/presupuestos"
              className="text-muted-foreground hover:text-foreground text-sm font-medium"
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
                className="border-border hover:bg-muted/60 flex items-center justify-between gap-4 border-t px-6 py-3.5 text-sm first:border-t-0"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{estimate.title}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {estimate.number} ·{' '}
                    {data.clients.find((client) => client.id === estimate.clientId)?.name ??
                      'Sin cliente'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-4 tabular-nums">
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
            <Link to="/clientes" className="text-primary text-sm font-medium hover:underline">
              Ver clientes →
            </Link>
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
