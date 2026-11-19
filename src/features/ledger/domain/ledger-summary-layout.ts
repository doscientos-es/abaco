export const ledgerGridColumns = 12

export const accountingDatasetLabels = {
  clients: 'Exportar clientes',
  invoices: 'Exportar facturas',
  payments: 'Exportar cobros',
  expenses: 'Exportar gastos',
} as const

export type AccountingDataset = keyof typeof accountingDatasetLabels
export type LedgerExport = 'book' | 'vat' | AccountingDataset
export type LedgerChart = 'bars' | 'lines' | 'table' | 'donut' | 'ranking'

type ModuleDefinition = {
  title: string
  width: number
  charts?: readonly LedgerChart[]
  export?: LedgerExport
  adminOnly?: boolean
}

const modules = {
  income: { title: 'Ingresos', width: 3 },
  expenses: { title: 'Gastos', width: 3 },
  result: { title: 'Resultado', width: 3 },
  vat: { title: 'IVA a ingresar', width: 3 },
  monthly: { title: 'Ingresos y gastos por mes', width: 6, charts: ['bars', 'lines', 'table'] },
  categories: { title: 'Gastos por categoría', width: 6, charts: ['donut', 'ranking'] },
  recent: { title: 'Últimos apuntes', width: 6 },
  'csv-book': { title: 'CSV para la gestoría', width: 6, export: 'book' },
  'csv-vat': { title: 'Exportar IVA trimestral', width: 6, export: 'vat' },
  'csv-clients': {
    title: accountingDatasetLabels.clients,
    width: 6,
    export: 'clients',
    adminOnly: true,
  },
  'csv-invoices': {
    title: accountingDatasetLabels.invoices,
    width: 6,
    export: 'invoices',
    adminOnly: true,
  },
  'csv-payments': {
    title: accountingDatasetLabels.payments,
    width: 6,
    export: 'payments',
    adminOnly: true,
  },
  'csv-expenses': {
    title: accountingDatasetLabels.expenses,
    width: 6,
    export: 'expenses',
    adminOnly: true,
  },
} as const satisfies Record<string, ModuleDefinition>

export type LedgerModuleId = keyof typeof modules
export type LedgerModule = {
  id: LedgerModuleId
  width: number
  chart?: LedgerChart
  months?: 'all' | 6 | 12
}
export type LedgerSummaryLayout = { version: 1; modules: LedgerModule[] }

const defaultModules: LedgerModuleId[] = [
  'income',
  'expenses',
  'result',
  'vat',
  'monthly',
  'categories',
  'csv-book',
]
const moduleIds = Object.keys(modules) as LedgerModuleId[]

export function ledgerModuleDefinition(id: LedgerModuleId): ModuleDefinition {
  return modules[id]
}

export function availableLedgerModules(canExportDatasets: boolean): LedgerModuleId[] {
  return moduleIds.filter((id) => canExportDatasets || !ledgerModuleDefinition(id).adminOnly)
}

export function ledgerModuleWidths(id: LedgerModuleId): number[] {
  const minWidth = ledgerModuleDefinition(id).width
  return [3, 4, 6, 8, 9, ledgerGridColumns].filter((width) => width >= minWidth)
}

export function snapLedgerModuleWidth(id: LedgerModuleId, width: number): number {
  if (!Number.isFinite(width)) return ledgerModuleDefinition(id).width
  return ledgerModuleWidths(id).reduce((closest, candidate) =>
    Math.abs(candidate - width) < Math.abs(closest - width) ? candidate : closest,
  )
}

function moduleFrom(id: LedgerModuleId, saved: Record<string, unknown>): LedgerModule {
  const definition = ledgerModuleDefinition(id)
  const chart =
    definition.charts?.find((option) => option === saved.chart) ?? definition.charts?.[0]
  return {
    id,
    width: snapLedgerModuleWidth(
      id,
      typeof saved.width === 'number' ? saved.width : definition.width,
    ),
    ...(chart ? { chart } : {}),
    ...(id === 'monthly' ? { months: saved.months === 12 ? 12 : 6 } : {}),
    ...(id === 'categories'
      ? { months: saved.months === 6 || saved.months === 12 ? saved.months : 'all' }
      : {}),
  }
}

export function newLedgerModule(id: LedgerModuleId): LedgerModule {
  return moduleFrom(id, {})
}

export function defaultLedgerSummary(): LedgerSummaryLayout {
  return { version: 1, modules: defaultModules.map(newLedgerModule) }
}

export function resolveLedgerSummary(
  value: unknown,
  canExportDatasets: boolean,
): LedgerSummaryLayout {
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('modules' in value) ||
    !Array.isArray(value.modules)
  )
    return defaultLedgerSummary()

  const allowed = availableLedgerModules(canExportDatasets)
  const seen = new Set<LedgerModuleId>()
  const reconciled: LedgerModule[] = []
  for (const entry of value.modules) {
    if (!entry || typeof entry !== 'object') continue
    const saved = entry as Record<string, unknown>
    const id = allowed.find((option) => option === saved.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    reconciled.push(moduleFrom(id, saved))
  }
  return { version: 1, modules: reconciled }
}

export function moveLedgerModule(
  layout: LedgerSummaryLayout,
  id: string | number,
  to: number,
): LedgerSummaryLayout {
  const from = layout.modules.findIndex((module) => module.id === id)
  if (from < 0 || !Number.isInteger(to) || to < 0 || to >= layout.modules.length || from === to)
    return layout
  const items = [...layout.modules]
  const selected = items[from]
  if (!selected) return layout
  items.splice(from, 1)
  items.splice(to, 0, selected)
  return { ...layout, modules: items }
}
