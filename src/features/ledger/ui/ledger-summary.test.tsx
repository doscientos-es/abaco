import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatEuros } from '@/shared/domain/money'
import type { LedgerEntry } from '@/shared/domain/types'
import { DashboardPageHeading } from '@/shared/ui/dashboard-layout-editor'

import {
  ledgerSummaryStorageKey,
  readLedgerSummary,
  writeLedgerSummary,
} from '../application/ledger-summary-preferences'
import { ledgerEntriesInQuarter, type LedgerQuarter } from '../domain/ledger-quarter'
import { defaultLedgerSummary, newLedgerModule } from '../domain/ledger-summary-layout'
import { LedgerSummary, useLedgerSummaryEditor } from './ledger-summary'

const key = ledgerSummaryStorageKey('empresa-a', 'usuario-a')
const month = '2026-03'
const expense: LedgerEntry = {
  id: 'expense',
  tenantId: 'empresa-a',
  date: `${month}-15`,
  kind: 'expense',
  category: 'Materiales de prueba',
  concept: 'Compra de prueba',
  amountCents: 12100,
  vatRate: 21,
  estimateId: null,
  milestoneId: null,
}

function Dashboard({
  canExportDatasets,
  ...props
}: Omit<React.ComponentProps<typeof LedgerSummary>, 'layout' | 'onImport'> & {
  canExportDatasets: boolean
}) {
  const layout = useLedgerSummaryEditor(key, canExportDatasets)
  return (
    <>
      <DashboardPageHeading title="Contabilidad" editor={layout.editor} />
      <LedgerSummary {...props} layout={layout} onImport={() => undefined} />
    </>
  )
}

describe('accounting summary preferences', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (id: string) => storage.get(id) ?? null,
        setItem: (id: string, value: string) => storage.set(id, value),
      },
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('reopens the saved order, width, chart choices and permitted export buttons', () => {
    const layout = {
      version: 1,
      modules: [
        newLedgerModule('csv-payments'),
        { ...newLedgerModule('monthly'), width: 9, chart: 'lines', months: 12 },
        { ...newLedgerModule('categories'), chart: 'ranking' },
      ],
    } as const
    expect(writeLedgerSummary(key, { ...layout, modules: [...layout.modules] })).toBe(true)

    const exportAction = vi.fn(() => ({ run: vi.fn(), disabled: false }))
    const render = (canExportDatasets: boolean, quarter: LedgerQuarter | null = null) =>
      renderToStaticMarkup(
        <Dashboard
          canExportDatasets={canExportDatasets}
          entries={[expense]}
          quarter={quarter}
          periodFilter={null}
          exportAction={exportAction}
        />,
      )

    const html = render(true, { year: 2026, quarter: 1 })
    const header = html.split('aria-label="Resumen contable"')[0]
    expect(header).toContain('<h1>Contabilidad</h1>')
    expect(header).toMatch(
      /<button(?=[^>]*aria-label="Personalizar resumen")(?=[^>]*data-slot="icon-button")/,
    )
    expect(html).toContain('Descargar CSV')
    expect(html).toContain('--dashboard-span:9')
    expect(html).toContain('aria-label="Añadir Importar apuntes"')
    expect(html).toContain('Los tres meses del trimestre seleccionado')
    expect(html).toContain('stroke-success')
    expect(html).toContain(`mar: Ingresos ${formatEuros(0)}, Gastos ${formatEuros(12100)}`)
    expect(html).toContain('Materiales de prueba')
    expect(html).not.toContain('aria-label="IVA a ingresar"')
    expect(html.indexOf('Exportar cobros')).toBeLessThan(html.indexOf('Ingresos y gastos por mes'))
    expect(exportAction).toHaveBeenCalledExactlyOnceWith('payments')

    exportAction.mockClear()
    const history = render(false)
    expect(history).not.toContain('Descargar CSV')
    expect(history).not.toContain('aria-label="Añadir Exportar cobros"')
    expect(history).toContain('aria-label="Añadir Últimos apuntes"')
    expect(history).toContain('Últimos 12 meses')
    expect(exportAction).not.toHaveBeenCalled()
  })

  it('uses independent history per chart without changing the scope of totals', () => {
    const now = new Date()
    const sevenMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 7, 15, 12)
      .toISOString()
      .slice(0, 10)
    writeLedgerSummary(key, {
      version: 1,
      modules: [
        newLedgerModule('expenses'),
        { ...newLedgerModule('monthly'), chart: 'table', months: 12 },
        { ...newLedgerModule('categories'), chart: 'ranking', months: 6 },
      ],
    })
    const html = renderToStaticMarkup(
      <Dashboard
        canExportDatasets={false}
        entries={[{ ...expense, date: sevenMonthsAgo }]}
        quarter={null}
        periodFilter={null}
        exportAction={() => ({ run: vi.fn(), disabled: true })}
      />,
    )
    expect(html).toContain('Últimos 12 meses')
    expect(html).toContain('Últimos 6 meses')
    expect(html).toContain(formatEuros(expense.amountCents))
    expect(html).toContain('Aún no hay gastos en este periodo')
    expect(html).not.toContain(expense.category)
  })

  it('renders import and book export as cards for a new dashboard, with admin exports available to add', () => {
    const html = renderToStaticMarkup(
      <Dashboard
        canExportDatasets
        entries={[expense]}
        quarter={null}
        periodFilter={null}
        exportAction={() => ({ run: vi.fn(), disabled: false })}
      />,
    )
    expect(html).toContain('data-dashboard-module="import-entries"')
    expect(html).toContain('aria-label="Importar de Excel"')
    expect(html).toContain('data-dashboard-module="csv-book"')
    expect(html).toContain('aria-label="Descargar CSV para la gestoría"')
    expect(html).toContain('aria-label="Añadir Exportar facturas"')
  })

  it('renders only the selected quarter in the monthly table, including months without movements', () => {
    writeLedgerSummary(key, {
      version: 1,
      modules: [{ ...newLedgerModule('monthly'), chart: 'table' }],
    })
    const quarter = { year: 2026, quarter: 1 }
    const entries = ledgerEntriesInQuarter(
      [
        { ...expense, date: '2025-12-31', amountCents: 45678 },
        expense,
        { ...expense, date: '2026-04-01', amountCents: 56789 },
      ],
      quarter,
    )
    const html = renderToStaticMarkup(
      <Dashboard
        canExportDatasets={false}
        entries={entries}
        quarter={quarter}
        periodFilter={null}
        exportAction={() => ({ run: vi.fn(), disabled: true })}
      />,
    )
    expect(html).toContain('ene 2026')
    expect(html).toContain('feb 2026')
    expect(html).toContain('mar 2026')
    expect(html).not.toContain('dic 2025')
    expect(html).not.toContain('abr 2026')
    expect(html).toContain(formatEuros(12100))
  })

  it('isolates layouts by company and user and recovers from corrupt browser storage', () => {
    const empty = { version: 1 as const, modules: [] }
    writeLedgerSummary(key, empty)
    expect(readLedgerSummary(key, false)).toEqual(empty)
    expect(readLedgerSummary(ledgerSummaryStorageKey('empresa-a', 'usuario-b'), false)).toEqual(
      defaultLedgerSummary(),
    )
    expect(readLedgerSummary(ledgerSummaryStorageKey('empresa-b', 'usuario-a'), false)).toEqual(
      defaultLedgerSummary(),
    )

    window.localStorage.setItem(key, '{invalid json')
    expect(readLedgerSummary(key, false)).toEqual(defaultLedgerSummary())
  })
})
