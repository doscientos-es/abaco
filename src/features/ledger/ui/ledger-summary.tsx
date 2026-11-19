import { useMemo, useState, type ReactNode } from 'react'

import type { LedgerEntry } from '@/shared/domain/types'
import { DashboardLayoutEditor } from '@/shared/ui/dashboard-layout-editor'
import { useDashboardLayout } from '@/shared/ui/use-dashboard-layout'

import { readLedgerSummary, writeLedgerSummary } from '../application/ledger-summary-preferences'
import type { LedgerQuarter } from '../domain/ledger-quarter'
import { ledgerSummaryData } from '../domain/ledger-summary-data'
import {
  availableLedgerModules,
  defaultLedgerSummary,
  ledgerModuleDefinition,
  newLedgerModule,
  type LedgerExport,
} from '../domain/ledger-summary-layout'
import { LedgerSummaryWidget } from './ledger-summary-widget'
import type { LedgerExportAction } from './use-ledger-exports'

export function useLedgerSummaryEditor(storageKey: string, canExportDatasets: boolean) {
  const [saved, setSaved] = useState(() => readLedgerSummary(storageKey, canExportDatasets))
  const [stored, setStored] = useState(true)
  const editor = useDashboardLayout({
    saved,
    defaults: defaultLedgerSummary,
    createModule: newLedgerModule,
    onSave: (next) => {
      setStored(writeLedgerSummary(storageKey, next))
      setSaved(next)
    },
  })
  return {
    editor,
    notice: stored
      ? 'Diseño guardado en este navegador.'
      : 'El navegador no permite guardar el diseño. Los cambios solo se aplican mientras esta vista está abierta.',
    options: availableLedgerModules(canExportDatasets).map((id) => {
      const { title, width, description } = ledgerModuleDefinition(id)
      return { id, title, minWidth: width, ...(description ? { description } : {}) }
    }),
  }
}

export function LedgerSummary({
  layout,
  entries,
  quarter,
  periodFilter,
  exportAction,
  onImport,
}: {
  layout: ReturnType<typeof useLedgerSummaryEditor>
  entries: LedgerEntry[]
  quarter: LedgerQuarter | null
  periodFilter: ReactNode
  exportAction: (id: LedgerExport) => LedgerExportAction
  onImport: () => void
}) {
  const data = useMemo(() => ledgerSummaryData(entries, quarter), [entries, quarter])
  const { editor } = layout

  return (
    <section aria-label="Resumen contable" className="space-y-4">
      {periodFilter}
      <DashboardLayoutEditor
        {...layout}
        label="Módulos del resumen contable"
        renderModule={(module) => (
          <LedgerSummaryWidget
            module={module}
            data={data}
            exportAction={exportAction}
            onImport={onImport}
            onChange={
              editor.editing
                ? (patch) => editor.changeModule(module.id, (item) => ({ ...item, ...patch }))
                : undefined
            }
          />
        )}
      />
    </section>
  )
}
