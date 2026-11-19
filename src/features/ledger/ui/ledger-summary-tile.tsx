import { useSortable } from '@dnd-kit/react/sortable'
import { IconButton } from '@doscientos/ui'
import { ArrowsLeftRight, DotsSixVertical, X } from '@phosphor-icons/react'
import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react'

import { SelectField } from '@/shared/ui/form'

import {
  ledgerGridColumns,
  ledgerModuleDefinition,
  ledgerModuleWidths,
  snapLedgerModuleWidth,
  type LedgerChart,
  type LedgerModule,
} from '../domain/ledger-summary-layout'

const chartLabels: Record<LedgerChart, string> = {
  bars: 'Barras',
  lines: 'Líneas',
  table: 'Tabla',
  donut: 'Anillo',
  ranking: 'Barras horizontales',
}

export function LedgerSummaryTile({
  module,
  index,
  editing,
  showHistoryRange,
  onChange,
  onRemove,
  children,
}: {
  module: LedgerModule
  index: number
  editing: boolean
  showHistoryRange: boolean
  onChange: (patch: Partial<Omit<LedgerModule, 'id'>>) => void
  onRemove: () => void
  children: ReactNode
}) {
  const { id, width } = module
  const definition = ledgerModuleDefinition(id)
  const { ref, handleRef, isDragging } = useSortable({ id, index, disabled: !editing })
  const resize = useRef<{ x: number; initialWidth: number; width: number; step: number } | null>(
    null,
  )

  function startResize(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return
    const grid = event.currentTarget.closest('article')?.parentElement
    if (!grid) return
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0
    const step = (grid.getBoundingClientRect().width + gap) / ledgerGridColumns
    if (step <= 0) return
    resize.current = { x: event.clientX, initialWidth: width, width, step }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function changeSize(event: PointerEvent<HTMLButtonElement>) {
    const active = resize.current
    if (!active || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const next = snapLedgerModuleWidth(
      id,
      active.initialWidth + (event.clientX - active.x) / active.step,
    )
    if (next === active.width) return
    active.width = next
    onChange({ width: next })
  }

  return (
    <article
      ref={ref}
      aria-label={definition.title}
      style={{ '--ledger-span': width } as CSSProperties}
      className={`relative flex min-w-0 flex-col xl:col-span-(--ledger-span) ${width >= 6 ? 'sm:max-xl:col-span-2' : ''} ${editing ? 'border-border bg-muted/30 rounded-xl border border-dashed p-2' : ''} ${isDragging ? 'z-10 opacity-70' : ''}`}
    >
      {editing ? (
        <div className="mb-2 space-y-2">
          <div className="flex items-center gap-1.5">
            <button
              ref={handleRef}
              type="button"
              aria-label={`Mover ${definition.title}`}
              className="text-muted-foreground hover:bg-muted focus-visible:ring-ring flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg focus-visible:ring-2 active:cursor-grabbing"
            >
              <DotsSixVertical aria-hidden="true" className="size-5" />
            </button>
            <span className="min-w-0 flex-1 text-sm font-medium break-words">
              {definition.title}
            </span>
            <IconButton label={`Quitar ${definition.title}`} variant="ghost" onPress={onRemove}>
              <X aria-hidden="true" className="size-4" />
            </IconButton>
          </div>
          <div className="flex flex-wrap items-end gap-2 px-1">
            <SelectField
              label={`Ancho de ${definition.title}`}
              hideLabel
              value={String(width)}
              options={ledgerModuleWidths(id).map((size) => ({
                value: String(size),
                label: `${size}/${ledgerGridColumns} columnas`,
              }))}
              onChange={(value) => onChange({ width: snapLedgerModuleWidth(id, Number(value)) })}
            />
            {definition.charts && module.chart ? (
              <SelectField
                label={`Gráfico de ${definition.title}`}
                hideLabel
                value={module.chart}
                options={definition.charts.map((chart) => ({
                  value: chart,
                  label: chartLabels[chart],
                }))}
                onChange={(value) => {
                  const chart = definition.charts?.find((item) => item === value)
                  if (chart) onChange({ chart })
                }}
              />
            ) : null}
            {id === 'monthly' && showHistoryRange ? (
              <SelectField
                label="Meses del gráfico"
                hideLabel
                value={String(module.months ?? 6)}
                options={[
                  { value: '6', label: '6 meses' },
                  { value: '12', label: '12 meses' },
                ]}
                onChange={(value) => onChange({ months: value === '12' ? 12 : 6 })}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="min-w-0 flex-1 [&>*]:h-full">{children}</div>
      {editing ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Arrastrar para ajustar el ancho de ${definition.title}`}
          title="Arrastra para cambiar el ancho"
          className="border-border bg-background text-muted-foreground hover:bg-muted absolute -right-1 -bottom-1 hidden size-8 touch-none items-center justify-center rounded-md border shadow-sm xl:flex xl:cursor-ew-resize"
          onPointerDown={startResize}
          onPointerMove={changeSize}
          onPointerUp={changeSize}
          onLostPointerCapture={() => {
            resize.current = null
          }}
          onPointerCancel={() => {
            if (resize.current) onChange({ width: resize.current.initialWidth })
            resize.current = null
          }}
        >
          <ArrowsLeftRight aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </article>
  )
}
