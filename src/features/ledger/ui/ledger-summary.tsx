import { useMemo, useState, type ReactNode } from 'react'

import type { LedgerEntry } from '@/shared/domain/types'
import {
  DashboardCanvas,
  DashboardLayoutActions,
  DashboardLayoutHelp,
} from '@/shared/ui/dashboard-layout-editor'

import { readLedgerSummary, writeLedgerSummary } from '../application/ledger-summary-preferences'
import type { LedgerQuarter } from '../domain/ledger-quarter'
import { ledgerSummaryData } from '../domain/ledger-summary-data'
import {
  availableLedgerModules,
  defaultLedgerSummary,
  ledgerModuleDefinition,
  moveLedgerModule,
  newLedgerModule,
  type LedgerExport,
  type LedgerModuleId,
  type LedgerSummaryLayout,
} from '../domain/ledger-summary-layout'
import { LedgerSummaryTile } from './ledger-summary-tile'
import { LedgerSummaryWidget } from './ledger-summary-widget'
import type { LedgerExportAction } from './use-ledger-exports'

export function LedgerSummary({
  storageKey,
  canExportDatasets,
  entries,
  quarter,
  periodFilter,
  exportAction,
}: {
  storageKey: string
  canExportDatasets: boolean
  entries: LedgerEntry[]
  quarter: LedgerQuarter | null
  periodFilter: ReactNode
  exportAction: (id: LedgerExport) => LedgerExportAction
}) {
  const [saved, setSaved] = useState(() => readLedgerSummary(storageKey, canExportDatasets))
  const [draft, setDraft] = useState<LedgerSummaryLayout | null>(null)
  const [notice, setNotice] = useState('')
  const data = useMemo(() => ledgerSummaryData(entries, quarter), [entries, quarter])
  const layout = draft ?? saved
  const editing = draft !== null
  const changed = draft !== null && JSON.stringify(saved) !== JSON.stringify(draft)
  const options = availableLedgerModules(canExportDatasets).map((id) => ({
    id,
    title: ledgerModuleDefinition(id).title,
  }))

  function persist(next: LedgerSummaryLayout) {
    const stored = writeLedgerSummary(storageKey, next)
    setSaved(next)
    setDraft(null)
    setNotice(
      stored
        ? 'Diseño guardado en este navegador.'
        : 'El navegador no permite guardar el diseño. Los cambios solo se aplican mientras esta vista está abierta.',
    )
  }

  function updateDraft(update: (current: LedgerSummaryLayout) => LedgerSummaryLayout) {
    setDraft((current) => (current ? update(current) : current))
  }

  function addModule(id: LedgerModuleId) {
    const append = (current: LedgerSummaryLayout): LedgerSummaryLayout =>
      current.modules.some((module) => module.id === id)
        ? current
        : { ...current, modules: [...current.modules, newLedgerModule(id)] }
    if (editing) updateDraft(append)
    else if (!saved.modules.some((module) => module.id === id)) persist(append(saved))
  }

  return (
    <section aria-label="Resumen contable" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Resumen contable</h2>
        <DashboardLayoutActions
          editing={editing}
          changed={changed}
          onEdit={() => {
            setNotice('')
            setDraft(saved)
          }}
          onCancel={() => setDraft(null)}
          onSave={() => {
            if (changed) persist(draft)
          }}
        />
      </div>
      {periodFilter}
      {editing ? (
        <DashboardLayoutHelp resize onReset={() => setDraft(defaultLedgerSummary())} />
      ) : null}
      {notice ? <output className="text-muted-foreground block text-sm">{notice}</output> : null}
      <DashboardCanvas
        label="Módulos del resumen contable"
        gridClassName="grid gap-3 sm:grid-cols-2 xl:grid-cols-12"
        activeIds={layout.modules.map(({ id }) => id)}
        options={options}
        onAdd={addModule}
        onMove={(id, index) => updateDraft((current) => moveLedgerModule(current, id, index))}
        empty={
          <p className="border-border text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
            Tu resumen está vacío. Añade abajo los módulos que quieras mostrar.
          </p>
        }
      >
        {layout.modules.map((module, index) => {
          function changeModule(patch: Partial<Omit<typeof module, 'id'>>) {
            updateDraft((current) => ({
              ...current,
              modules: current.modules.map((item) =>
                item.id === module.id ? { ...item, ...patch } : item,
              ),
            }))
          }
          return (
            <LedgerSummaryTile
              key={module.id}
              module={module}
              index={index}
              editing={editing}
              onWidthChange={(width) => changeModule({ width })}
              onRemove={() =>
                updateDraft((current) => ({
                  ...current,
                  modules: current.modules.filter((item) => item.id !== module.id),
                }))
              }
            >
              <LedgerSummaryWidget
                module={module}
                data={data}
                exportAction={exportAction}
                onChange={editing ? changeModule : undefined}
              />
            </LedgerSummaryTile>
          )
        })}
      </DashboardCanvas>
    </section>
  )
}
