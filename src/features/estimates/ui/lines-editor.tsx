import {
  AutocompleteCombobox,
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  HighlightMatch,
  Input,
} from '@doscientos/ui'
import { ArrowDown, ArrowUp, Copy, DotsThree, Trash } from '@phosphor-icons/react'
import { useState } from 'react'

import { clampPercent, lineNetCents } from '@/shared/domain/estimate'
import { formLimits } from '@/shared/domain/form-limits'
import { formatEuros, lineTotal } from '@/shared/domain/money'
import type { CatalogItem, Estimate, EstimateLine } from '@/shared/domain/types'
import { newId } from '@/shared/store/store'

import { patchEstimate } from '../application/estimate-actions'
import { PriceInput } from './price-input'

const FREE_KEY = '__free__'
const gridCols =
  'grid grid-cols-2 items-end gap-2 @min-[46rem]:grid-cols-[minmax(10rem,1fr)_4.75rem_4.5rem_7rem_5.5rem_minmax(5.5rem,auto)_2rem]'

/** Visible field label when there is not enough room for the column headers. */
function MobileLabel({ children }: { children: string }) {
  return <span className="text-muted-foreground mb-1 block text-xs @min-[46rem]:hidden">{children}</span>
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

  function duplicateLine(id: string) {
    const index = estimate.lines.findIndex((line) => line.id === id)
    const source = estimate.lines[index]
    if (!source) return
    setLines([
      ...estimate.lines.slice(0, index + 1),
      { ...source, id: newId() },
      ...estimate.lines.slice(index + 1),
    ])
  }

  function moveLine(id: string, direction: -1 | 1) {
    const index = estimate.lines.findIndex((line) => line.id === id)
    const nextIndex = index + direction
    const current = estimate.lines[index]
    const next = estimate.lines[nextIndex]
    if (!current || !next) return
    const lines = [...estimate.lines]
    lines[index] = next
    lines[nextIndex] = current
    setLines(lines)
  }

  function removeLine(id: string) {
    setLines(estimate.lines.filter((line) => line.id !== id))
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
    <div className="@container space-y-3">
      {estimate.lines.length > 0 ? (
        <div className="space-y-2">
          <div
            className={`${gridCols} text-muted-foreground hidden px-3 text-xs font-medium @min-[46rem]:grid`}
          >
            <span>Descripción</span>
            <span className="text-right">Cantidad</span>
            <span>Unidad</span>
            <span className="text-right">Precio ud. sin IVA</span>
            <span className="text-right">Dto. %</span>
            <span className="text-right">Total</span>
            <span aria-hidden="true" />
          </div>
          {estimate.lines.map((line, lineIndex) => (
            <div
              key={line.id}
              className="border-border bg-background focus-within:border-ring/60 rounded-lg border p-3 shadow-(--ui-shadow-hairline) transition-colors"
            >
              <div className={gridCols}>
                <Input
                  aria-label="Descripción"
                  maxLength={formLimits.estimateLineDescription}
                  placeholder="Describe el trabajo o material"
                  className="col-span-2 h-8 min-w-0 px-2 @min-[46rem]:col-span-1"
                  value={line.description}
                  onChange={(event) => updateLine(line.id, { description: event.target.value })}
                />
                <div className="min-w-0">
                  <MobileLabel>Cantidad</MobileLabel>
                  <Input
                    aria-label="Cantidad"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={formLimits.quantity}
                    step="0.001"
                    className="h-8 min-w-0 px-2 text-right tabular-nums"
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
                <div className="min-w-0">
                  <MobileLabel>Unidad</MobileLabel>
                  <Input
                    aria-label="Unidad"
                    maxLength={formLimits.unit}
                    placeholder="ud, m², h…"
                    className="h-8 min-w-0 px-2"
                    value={line.unit}
                    onChange={(event) => updateLine(line.id, { unit: event.target.value })}
                  />
                </div>
                <div className="min-w-0">
                  <MobileLabel>Precio ud. (€)</MobileLabel>
                  <PriceInput
                    label="Precio unitario"
                    cents={line.unitPriceCents}
                    className="h-8 min-w-0 px-2"
                    onCommit={(unitPriceCents) => updateLine(line.id, { unitPriceCents })}
                  />
                </div>
                <div className="min-w-0">
                  <MobileLabel>Dto. (%)</MobileLabel>
                  <Input
                    aria-label="Descuento de la línea (%)"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.01"
                    className="h-8 min-w-0 px-2 text-right tabular-nums"
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
                </div>
                <div className="min-w-0 @min-[46rem]:text-right">
                  <MobileLabel>Total</MobileLabel>
                  <p className="text-sm font-semibold tabular-nums">
                    {line.discountPercent > 0 ? (
                      <span className="text-muted-foreground mr-1 text-xs font-normal line-through">
                        {formatEuros(lineTotal(line.quantity, line.unitPriceCents))}
                      </span>
                    ) : null}
                    {formatEuros(lineNetCents(line))}
                  </p>
                </div>
                <div className="flex justify-end">
                  <DropdownMenuTrigger>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Más opciones de ${line.description || 'partida'}`}
                    >
                      <DotsThree aria-hidden="true" weight="bold" className="size-4" />
                    </Button>
                    <DropdownMenuContent placement="bottom end">
                      <DropdownMenuItem onAction={() => duplicateLine(line.id)}>
                        <Copy aria-hidden="true" className="size-4" />
                        Duplicar partida
                      </DropdownMenuItem>
                      {lineIndex > 0 ? (
                        <DropdownMenuItem onAction={() => moveLine(line.id, -1)}>
                          <ArrowUp aria-hidden="true" className="size-4" />
                          Mover arriba
                        </DropdownMenuItem>
                      ) : null}
                      {lineIndex < estimate.lines.length - 1 ? (
                        <DropdownMenuItem onAction={() => moveLine(line.id, 1)}>
                          <ArrowDown aria-hidden="true" className="size-4" />
                          Mover abajo
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onAction={() => removeLine(line.id)}>
                        <Trash aria-hidden="true" className="size-4" />
                        Eliminar partida
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenuTrigger>
                </div>
              </div>
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
