import { resolveCategoryChartFormat } from '@/shared/domain/category-chart-format'
import { snapDashboardWidth } from '@/shared/domain/dashboard-layout'
import type { DashboardConfig } from '@/shared/domain/types'

export const dashboardWidgets = [
  {
    id: 'key-metrics',
    title: 'Indicadores principales',
    minWidth: 6,
    defaultWidth: 12,
    description: 'Cobros, presupuestos y aceptación de propuestas.',
  },
  {
    id: 'income-expenses',
    title: 'Ingresos y gastos',
    minWidth: 6,
    description: 'Evolución mensual de tus movimientos.',
  },
  {
    id: 'estimate-status',
    title: 'Presupuestos por estado',
    minWidth: 6,
    description: 'Importe de presupuestos enviados, aceptados y pendientes.',
  },
  {
    id: 'receivables',
    title: 'Qué me deben',
    minWidth: 6,
    defaultWidth: 12,
    description: 'Facturas pendientes y vencidas.',
  },
  {
    id: 'recent-estimates',
    title: 'Últimos presupuestos',
    minWidth: 6,
    defaultWidth: 12,
    description: 'Acceso rápido a las propuestas más recientes.',
  },
  {
    id: 'clients',
    title: 'Clientes',
    minWidth: 3,
    defaultWidth: 6,
    description: 'Resumen de tu cartera de clientes activa.',
  },
  {
    id: 'expense-categories',
    title: 'Gastos por categoría',
    minWidth: 6,
    description: 'Distribución de tus gastos por categoría.',
  },
  {
    id: 'recent-movements',
    title: 'Últimos movimientos',
    minWidth: 6,
    description: 'Cobros y gastos recientes de contabilidad.',
  },
] as const

export type DashboardWidgetId = (typeof dashboardWidgets)[number]['id']
type DashboardWidget = { id: DashboardWidgetId; width: number }
export type SummaryDashboardLayout = { modules: DashboardWidget[]; charts: DashboardCharts }

export function newDashboardWidget(id: DashboardWidgetId, width?: unknown): DashboardWidget {
  const definition = dashboardWidgets.find((item) => item.id === id)
  if (!definition) throw new Error(`Unknown dashboard widget: ${id}`)
  const fallback = 'defaultWidth' in definition ? definition.defaultWidth : definition.minWidth
  return { id, width: snapDashboardWidth(width, definition.minWidth, fallback) }
}

export function resolveDashboardLayout(config?: DashboardConfig): SummaryDashboardLayout {
  return {
    modules: resolveDashboardWidgets(config).map((id) =>
      newDashboardWidget(id, config?.widths?.[id]),
    ),
    charts: resolveDashboardCharts(config),
  }
}

/** Preserve the current dashboard as the first-time experience. */
export const defaultDashboardWidgets: DashboardWidgetId[] = [
  'key-metrics',
  'income-expenses',
  'estimate-status',
  'receivables',
  'recent-estimates',
]

const knownIds = new Set<string>(dashboardWidgets.map((widget) => widget.id))

export function resolveDashboardChart(config?: DashboardConfig) {
  return {
    incomeChart: config?.incomeChart === 'lines' ? 'lines' : 'bars',
    incomeMonths: config?.incomeMonths === 12 ? 12 : 6,
  } as const
}

export type DashboardCharts = Required<NonNullable<DashboardConfig['charts']>> &
  ReturnType<typeof resolveDashboardChart>

export function resolveDashboardCharts(config?: DashboardConfig): DashboardCharts {
  const expenses = config?.charts?.['expense-categories']
  const estimates = config?.charts?.['estimate-status']
  return {
    ...resolveDashboardChart(config),
    'expense-categories': {
      format: resolveCategoryChartFormat(expenses?.format),
      months: expenses?.months === 6 || expenses?.months === 12 ? expenses.months : 1,
    },
    'estimate-status': {
      metric: estimates?.metric === 'count' ? 'count' : 'amount',
      months: estimates?.months === 6 || estimates?.months === 12 ? estimates.months : 'all',
    },
  }
}

export function dashboardConfigFrom({
  modules,
  charts: options,
}: SummaryDashboardLayout): DashboardConfig {
  const { incomeChart, incomeMonths, ...charts } = options
  return {
    version: 1,
    widgets: modules.map(({ id }) => id),
    widths: Object.fromEntries(modules.map(({ id, width }) => [id, width])),
    incomeChart,
    incomeMonths,
    charts,
  }
}

export function resolveDashboardWidgets(config?: DashboardConfig): DashboardWidgetId[] {
  if (!config || config.version !== 1) return [...defaultDashboardWidgets]
  const uniqueKnown = config.widgets.filter(
    (id, index, items): id is DashboardWidgetId => knownIds.has(id) && items.indexOf(id) === index,
  )
  if (config.widgets.length > 0 && uniqueKnown.length === 0) return [...defaultDashboardWidgets]
  return uniqueKnown
}
