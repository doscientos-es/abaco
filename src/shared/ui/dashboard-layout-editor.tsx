import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { Button, IconButton } from '@doscientos/ui'
import {
  ArrowCounterClockwise,
  DotsSixVertical,
  Plus,
  SlidersHorizontal,
  X,
} from '@phosphor-icons/react'
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

export function DashboardLayoutActions({
  editing,
  changed,
  onEdit,
  onCancel,
  onSave,
  iconOnly = false,
}: {
  editing: boolean
  changed: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  iconOnly?: boolean
}) {
  const icon = <SlidersHorizontal aria-hidden="true" className="size-4" />
  if (!editing) {
    return iconOnly ? (
      <IconButton label="Personalizar resumen" variant="ghost" onPress={onEdit}>
        {icon}
      </IconButton>
    ) : (
      <Button size="sm" variant="outline" onPress={onEdit}>
        {icon} Personalizar resumen
      </Button>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onPress={onCancel}>
        Cancelar
      </Button>
      <Button size="sm" isDisabled={!changed} onPress={onSave}>
        Guardar diseño
      </Button>
    </div>
  )
}

export function DashboardLayoutHelp({
  resize = false,
  onReset,
}: {
  resize?: boolean
  onReset: () => void
}) {
  return (
    <div className="border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-semibold">Organiza tus módulos</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Arrastra para ordenar o usa Espacio y las flechas.{' '}
          {resize ? 'Puedes ajustar el ancho de los módulos en escritorio. ' : ''}
          Los módulos que puedes añadir están al final.
        </p>
      </div>
      <Button size="sm" variant="ghost" onPress={onReset}>
        <ArrowCounterClockwise aria-hidden="true" className="size-4" /> Restaurar diseño
      </Button>
    </div>
  )
}

type ModuleOption<Id extends string> = { id: Id; title: string; description?: string }

export function DashboardCanvas<Id extends string>({
  label,
  gridClassName,
  activeIds,
  options,
  onAdd,
  onMove,
  empty,
  children,
}: {
  label: string
  gridClassName: string
  activeIds: readonly Id[]
  options: readonly ModuleOption<Id>[]
  onAdd: (id: Id) => void
  onMove: (source: string | number, index: number) => void
  empty: ReactNode
  children: ReactNode
}) {
  const available = options.filter(({ id }) => !activeIds.includes(id))
  const grid = useRef<HTMLElement>(null)
  const addedId = useRef<Id | null>(null)

  useEffect(() => {
    if (addedId.current === null) return
    const tile = Array.from(grid.current?.children ?? []).find(
      (item) => item instanceof HTMLElement && item.dataset.dashboardModule === addedId.current,
    )
    if (tile instanceof HTMLElement) {
      addedId.current = null
      tile.focus()
    }
  })

  return (
    <>
      {activeIds.length ? (
        <DragDropProvider
          onDragEnd={(event) => {
            const { source } = event.operation
            if (!event.canceled && isSortable(source)) onMove(source.id, source.index)
          }}
        >
          <section ref={grid} aria-label={label} className={gridClassName}>
            {children}
          </section>
        </DragDropProvider>
      ) : (
        empty
      )}
      {available.length ? (
        <section aria-label="Módulos disponibles" className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-medium">Módulos disponibles</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {available.map(({ id, title, description }) => (
              <Button
                key={id}
                aria-label={`Añadir ${title}`}
                variant="outline"
                className="hover:bg-muted/50 h-auto min-h-16 w-full justify-start gap-3 rounded-xl border-dashed px-4 py-3 text-left whitespace-normal"
                onPress={() => {
                  addedId.current = id
                  onAdd(id)
                }}
              >
                <Plus aria-hidden="true" className="text-primary size-5 shrink-0" />
                <span className="min-w-0">
                  <span className="block">{title}</span>
                  {description ? (
                    <span className="text-muted-foreground block text-xs font-normal">
                      {description}
                    </span>
                  ) : null}
                </span>
              </Button>
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}

export function DashboardModule({
  id,
  title,
  index,
  onRemove,
  className = '',
  style,
  tools,
  resizeHandle,
  children,
}: {
  id: string
  title: string
  index: number
  onRemove?: (() => void) | undefined
  className?: string
  style?: CSSProperties
  tools?: ReactNode
  resizeHandle?: ReactNode
  children: ReactNode
}) {
  const { ref, handleRef, isDragging } = useSortable({ id, index, disabled: !onRemove })
  return (
    <article
      ref={ref}
      aria-label={title}
      data-dashboard-module={id}
      tabIndex={-1}
      style={style}
      className={`relative flex min-w-0 flex-col ${className} ${onRemove ? 'border-border bg-muted/30 rounded-xl border border-dashed p-2' : ''} ${isDragging ? 'z-10 opacity-70' : ''}`}
    >
      {onRemove ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <button
            ref={handleRef}
            type="button"
            aria-label={`Mover ${title}`}
            className="text-muted-foreground hover:bg-muted focus-visible:ring-ring flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg focus-visible:ring-2 active:cursor-grabbing"
          >
            <DotsSixVertical aria-hidden="true" className="size-5" />
          </button>
          <span className="min-w-0 flex-1 text-sm font-medium break-words">{title}</span>
          {tools}
          <IconButton label={`Quitar ${title}`} variant="ghost" onPress={onRemove}>
            <X aria-hidden="true" className="size-4" />
          </IconButton>
        </div>
      ) : null}
      <div className="min-w-0 flex-1 [&>*]:h-full">{children}</div>
      {onRemove ? resizeHandle : null}
    </article>
  )
}
