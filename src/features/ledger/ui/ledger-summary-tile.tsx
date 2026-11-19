import { ArrowsLeftRight } from '@phosphor-icons/react'
import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react'

import { DashboardModule } from '@/shared/ui/dashboard-layout-editor'
import { SelectField } from '@/shared/ui/form'

import {
  ledgerGridColumns,
  ledgerModuleDefinition,
  ledgerModuleWidths,
  snapLedgerModuleWidth,
  type LedgerModule,
} from '../domain/ledger-summary-layout'

export function LedgerSummaryTile({
  module,
  index,
  editing,
  onWidthChange,
  onRemove,
  children,
}: {
  module: LedgerModule
  index: number
  editing: boolean
  onWidthChange: (width: number) => void
  onRemove: () => void
  children: ReactNode
}) {
  const { id, width } = module
  const definition = ledgerModuleDefinition(id)
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
    onWidthChange(next)
  }

  return (
    <DashboardModule
      id={id}
      index={index}
      title={definition.title}
      onRemove={editing ? onRemove : undefined}
      style={{ '--ledger-span': width } as CSSProperties}
      className={`xl:col-span-(--ledger-span) ${width >= 6 ? 'sm:max-xl:col-span-2' : ''}`}
      tools={
        editing ? (
          <SelectField
            label={`Ancho de ${definition.title}`}
            hideLabel
            value={String(width)}
            options={ledgerModuleWidths(id).map((size) => ({
              value: String(size),
              label: `${size}/${ledgerGridColumns} columnas`,
            }))}
            onChange={(value) => onWidthChange(snapLedgerModuleWidth(id, Number(value)))}
          />
        ) : null
      }
      resizeHandle={
        editing ? (
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
              if (resize.current) onWidthChange(resize.current.initialWidth)
              resize.current = null
            }}
          >
            <ArrowsLeftRight aria-hidden="true" className="size-4" />
          </button>
        ) : null
      }
    >
      {children}
    </DashboardModule>
  )
}
