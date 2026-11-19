import type { DashboardConfig } from '@/shared/domain/types'

export const dashboardWidgets = [
  {
    id: 'key-metrics',
    title: 'Indicadores principales',
    description: 'Cobros, presupuestos y aceptación de propuestas.',
  },
  {
    id: 'income-expenses',
    title: 'Ingresos y gastos',
    description: 'Evolución mensual de tus movimientos.',
  },
  {
    id: 'estimate-status',
    title: 'Presupuestos por estado',
    description: 'Importe de presupuestos enviados, aceptados y pendientes.',
  },
  {
    id: 'receivables',
    title: 'Qué me deben',
    description: 'Facturas pendientes y vencidas.',
  },
  {
    id: 'recent-estimates',
    title: 'Últimos presupuestos',
    description: 'Acceso rápido a las propuestas más recientes.',
  },
  {
    id: 'clients',
    title: 'Clientes',
    description: 'Resumen de tu cartera de clientes activa.',
  },
  {
    id: 'expense-categories',
    title: 'Gastos por categoría',
    description: 'Distribución de los gastos de este mes.',
  },
  {
    id: 'recent-movements',
    title: 'Últimos movimientos',
    description: 'Cobros y gastos recientes de contabilidad.',
  },
] as const

export type DashboardWidgetId = (typeof dashboardWidgets)[number]['id']

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
      format: expenses?.format === 'ranking' ? 'ranking' : 'donut',
      months: expenses?.months === 6 || expenses?.months === 12 ? expenses.months : 1,
    },
    'estimate-status': {
      metric: estimates?.metric === 'count' ? 'count' : 'amount',
      months: estimates?.months === 6 || estimates?.months === 12 ? estimates.months : 'all',
    },
  }
}

export function dashboardConfigFrom(
  widgets: DashboardWidgetId[],
  options: DashboardCharts,
): DashboardConfig {
  const { incomeChart, incomeMonths, ...charts } = options
  return { version: 1, widgets, incomeChart, incomeMonths, charts }
}

export function resolveDashboardWidgets(config?: DashboardConfig): DashboardWidgetId[] {
  if (!config || config.version !== 1) return [...defaultDashboardWidgets]
  const uniqueKnown = config.widgets.filter(
    (id, index, items): id is DashboardWidgetId => knownIds.has(id) && items.indexOf(id) === index,
  )
  if (config.widgets.length > 0 && uniqueKnown.length === 0) return [...defaultDashboardWidgets]
  return uniqueKnown
}

export function moveDashboardWidget(
  items: DashboardWidgetId[],
  from: number,
  to: number,
): DashboardWidgetId[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  if (item === undefined) return items
  next.splice(to, 0, item)
  return next
}
