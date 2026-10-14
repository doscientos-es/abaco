import { AutocompleteCombobox, Button, HighlightMatch, Input } from '@doscientos/ui'
import { useState } from 'react'

import { clampPercent, lineNetCents } from '@/shared/domain/estimate'
import { formLimits } from '@/shared/domain/form-limits'
import { formatEuros, lineTotal } from '@/shared/domain/money'
import type { CatalogItem, Estimate, EstimateLine } from '@/shared/domain/types'
import { newId } from '@/shared/store/store'

import { patchEstimate } from '../application/estimate-actions'
import { PriceInput } from './price-input'

const FREE_KEY = '__free__'
const gridCols = 'grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_5rem_5rem_8rem_14rem_4rem]'

/** Visible field label on phones, where the column header row is hidden. */
function MobileLabel({ children }: { children: string }) {
  return <span className="text-muted-foreground mb-1 block text-xs sm:hidden">{children}</span>
}

type PickerItem = { key: string; label: string; meta?: string; free?: boolean }

export function LinesEditor({ estimate, catalog }: { estimate: Estimate; catalog: CatalogItem[] }) {
  const [query, setQuery] = useState('')

  function setLines(lines: EstimateLine[]) {
    patchEstimate(estimate.id, { lines })
  }

  function updateLine(id: string, patch: Partial<EstimateLine>) {
    setLines(estimate.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  }

  function addFromCatalog(itemId: string) {
    const item = catalog.find((c) => c.id === itemId)
    if (!item) return
    setLines([
      ...estimate.lines,
      {
        id: newId(),
        catalogItemId: item.id,
        description: item.name,
        kind: item.kind,
        unit: item.unit,
        quantity: 1,
        unitPriceCents: item.unitPriceCents,
        discountPercent: 0,
      },
    ])
  }

  function addFree(description = '') {
    setLines([
      ...estimate.lines,
      {
        id: newId(),
        catalogItemId: null,
        description,
        kind: 'other',
        unit: 'ud',
        quantity: 1,
        unitPriceCents: 0,
        discountPercent: 0,
      },
    ])
  }

  function addFromPicker(key: string | number | null) {
    if (key === null) return
    if (key === FREE_KEY) addFree(query.trim())
    else addFromCatalog(String(key))
    setQuery('')
  }

  const pickerItems: PickerItem[] = [
    ...(query.trim() ? [{ key: FREE_KEY, label: query, free: true }] : []),
    ...catalog.map((item) => ({
      key: item.id,
      label: item.name,
      meta: `${formatEuros(item.unitPriceCents)} / ${item.unit}`,
    })),
  ]

  return (
    <div className="space-y-4">
      {estimate.lines.length > 0 ? (
        <div className="space-y-2">
          <div
            className={`${gridCols} text-muted-foreground hidden px-3 text-xs font-medium sm:grid`}
          >
            <span>Descripción</span>
            <span className="text-right">Cant.</span>
            <span>Unidad</span>
            <span className="text-right">Precio (sin IVA)</span>
            <span className="text-right">Descuento e importe</span>
            <span className="w-16" />
          </div>
          {estimate.lines.map((line) => (
            <div
              key={line.id}
              className={`${gridCols} border-border bg-background focus-within:border-ring/60 rounded-lg border p-3 shadow-(--ui-shadow-hairline) transition-colors`}
            >
              <Input
                aria-label="Descripción"
                maxLength={formLimits.estimateLineDescription}
                placeholder="Describe el trabajo o material"
                className="col-span-2 sm:col-span-1"
                value={line.description}
                onChange={(event) => updateLine(line.id, { description: event.target.value })}
              />
              <div>
                <MobileLabel>Cantidad</MobileLabel>
                <Input
                  aria-label="Cantidad"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={formLimits.quantity}
                  step="0.001"
                  className="text-right tabular-nums"
                  value={line.quantity}
                  onChange={(event) =>
                    updateLine(line.id, {
                      quantity:
                        Math.round(
                          Math.min(
                            formLimits.quantity,
                            Math.max(0, Number(event.target.value) || 0),
                          ) * 1000,
                        ) / 1000,
                    })
                  }
                />
              </div>
              <div>
                <MobileLabel>Unidad</MobileLabel>
                <Input
                  aria-label="Unidad"
                  maxLength={formLimits.unit}
                  placeholder="ud, m², h…"
                  value={line.unit}
                  onChange={(event) => updateLine(line.id, { unit: event.target.value })}
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <MobileLabel>Precio unitario (sin IVA, €)</MobileLabel>
                <PriceInput
                  label="Precio unitario"
                  cents={line.unitPriceCents}
                  onCommit={(unitPriceCents) => updateLine(line.id, { unitPriceCents })}
                />
              </div>
              <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                <div className="text-muted-foreground flex items-center gap-1 text-xs">
                  Dto.
                  <Input
                    aria-label="Descuento de la línea (%)"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.01"
                    className="w-16 text-right tabular-nums"
                    value={line.discountPercent || ''}
                    placeholder="0"
                    onChange={(event) =>
                      updateLine(line.id, {
                        discountPercent: Number(
                          clampPercent(Number(event.target.value) || 0).toFixed(2),
                        ),
                      })
                    }
                  />
                  %
                </div>
                <p className="text-sm font-semibold tabular-nums">
                  {line.discountPercent > 0 ? (
                    <span className="text-muted-foreground mr-1 text-xs font-normal line-through">
                      {formatEuros(lineTotal(line.quantity, line.unitPriceCents))}
                    </span>
                  ) : null}
                  {formatEuros(lineNetCents(line))}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive col-span-2 w-full sm:col-span-1 sm:w-16"
                aria-label="Quitar línea"
                onPress={() => setLines(estimate.lines.filter((l) => l.id !== line.id))}
              >
                Quitar
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="border-border bg-surface-subtle space-y-2 rounded-lg border border-dashed p-3">
        <p className="text-muted-foreground text-xs font-medium">Añadir partida</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <AutocompleteCombobox<PickerItem>
            aria-label="Buscar en el catálogo o escribir una partida"
            placeholder="Escribe para buscar en el catálogo o crear una partida nueva…"
            items={pickerItems}
            getItemKey={(item) => item.key}
            getItemLabel={(item) => item.label}
            suggestion={false}
            menuTrigger="focus"
            allowsEmptyCollection
            inputValue={query}
            onInputChange={setQuery}
            selectedKey={null}
            onSelectionChange={(key) => addFromPicker(key)}
            emptyState={
              <p className="text-muted-foreground px-3 py-4 text-center text-sm">
                Tu catálogo está vacío. Escribe y pulsa «Añadir».
              </p>
            }
            renderItem={(item, q) =>
              item.free ? (
                <span className="text-primary font-medium">
                  Añadir «{q.trim()}» como partida libre
                </span>
              ) : (
                <span className="flex w-full items-center justify-between gap-3">
                  <HighlightMatch text={item.label} query={q} />
                  <span className="text-muted-foreground text-xs tabular-nums">{item.meta}</span>
                </span>
              )
            }
          />
          <Button
            variant="outline"
            className="shrink-0"
            onPress={() => {
              addFree(query.trim())
              setQuery('')
            }}
          >
            Añadir
          </Button>
        </div>
      </div>
    </div>
  )
}
