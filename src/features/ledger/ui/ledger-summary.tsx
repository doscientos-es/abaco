import { DragDropProvider } from '@dnd-kit/react'
import { isSortable } from '@dnd-kit/react/sortable'
import { Button } from '@doscientos/ui'
import { SlidersHorizontal } from '@phosphor-icons/react'
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react'

import type { LedgerEntry } from '@/shared/domain/types'
import { SelectField } from '@/shared/ui/form'

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
  type LedgerSummaryLayout,
} from '../domain/ledger-summary-layout'
import { LedgerSummaryTile } from './ledger-summary-tile'
import { LedgerSummaryWidget } from './ledger-summary-widget'
import type { LedgerExportAction } from './use-ledger-exports'

type DragEnd = Parameters<NonNullable<ComponentProps<typeof DragDropProvider>['onDragEnd']>>[0]

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
  const available = availableLedgerModules(canExportDatasets).filter(
    (id) => !layout.modules.some((module) => module.id === id),
  )

  function edit() {
    setNotice('')
    setDraft(saved)
  }

  function save() {
    if (!draft || !changed) return
    const stored = writeLedgerSummary(storageKey, draft)
    setSaved(draft)
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

  function handleDragEnd(event: DragEnd) {
    const { source } = event.operation
    if (event.canceled || !isSortable(source)) return
    updateDraft((current) => moveLedgerModule(current, source.id, source.index))
  }

  return (
    <section aria-label="Resumen contable" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Resumen contable</h2>
        {editing ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onPress={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button size="sm" isDisabled={!changed} onPress={save}>
              Guardar diseño
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onPress={edit}>
            <SlidersHorizontal aria-hidden="true" className="size-4" /> Personalizar resumen
          </Button>
        )}
      </div>
      {periodFilter}
      {editing ? (
        <div className="border-border bg-card flex flex-wrap items-end justify-between gap-3 rounded-xl border p-4">
          <div className="min-w-0 flex-1 basis-72">
            <h3 className="text-sm font-semibold">Organiza tus módulos</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Arrastra para mover (o usa Espacio y las flechas). Ajusta el ancho de escritorio con
              el selector o arrastrando la esquina del módulo.
            </p>
          </div>
          {available.length ? (
            <SelectField
              label="Añadir módulo"
              value=""
              placeholder="Elige un módulo"
              searchable={false}
              options={available.map((id) => ({
                value: id,
                label: ledgerModuleDefinition(id).title,
              }))}
              onChange={(value) => {
                const id = available.find((item) => item === value)
                if (id)
                  updateDraft((current) =>
                    current.modules.some((item) => item.id === id)
                      ? current
                      : { ...current, modules: [...current.modules, newLedgerModule(id)] },
                  )
              }}
            />
          ) : null}
          <Button size="sm" variant="ghost" onPress={() => setDraft(defaultLedgerSummary())}>
            Restaurar diseño
          </Button>
        </div>
      ) : null}
      {notice ? <output className="text-muted-foreground block text-sm">{notice}</output> : null}
      {layout.modules.length ? (
        <DragDropProvider onDragEnd={handleDragEnd}>
          <div
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-12"
            aria-label="Módulos del resumen contable"
          >
            {layout.modules.map((module, index) => (
              <LedgerSummaryTile
                key={module.id}
                module={module}
                index={index}
                editing={editing}
                showHistoryRange={!quarter}
                onChange={(patch) =>
                  updateDraft((current) => ({
                    ...current,
                    modules: current.modules.map((item) =>
                      item.id === module.id ? { ...item, ...patch } : item,
                    ),
                  }))
                }
                onRemove={() =>
                  updateDraft((current) => ({
                    ...current,
                    modules: current.modules.filter((item) => item.id !== module.id),
                  }))
                }
              >
                <LedgerSummaryWidget module={module} data={data} exportAction={exportAction} />
              </LedgerSummaryTile>
            ))}
          </div>
        </DragDropProvider>
      ) : (
        <p className="border-border text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          Tu resumen está vacío.{' '}
          {editing ? 'Elige un módulo para empezar.' : 'Personalízalo para añadir módulos.'}
        </p>
      )}
    </section>
  )
}
