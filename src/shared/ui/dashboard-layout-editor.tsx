import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { Button, IconButton } from '@doscientos/ui'
import {
  ArrowCounterClockwise,
  ArrowsLeftRight,
  DotsSixVertical,
  Plus,
  SlidersHorizontal,
  X,
} from '@phosphor-icons/react'
import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react'

import {
  dashboardGridColumns,
  dashboardModuleWidths,
  snapDashboardWidth,
} from '@/shared/domain/dashboard-layout'

import { SelectField } from './form'
import type { DashboardLayout, DashboardLayoutController } from './use-dashboard-layout'
import { WorkspacePageHeading } from './workspace-page-chrome'

type Actions = Pick<
  DashboardLayoutController<DashboardLayout>,
  'enabled' | 'editing' | 'changed' | 'start' | 'cancel' | 'save'
>

export function DashboardPageHeading({
  title,
  actions,
  editor,
}: {
  title: ReactNode
  actions?: ReactNode
  editor?: Actions | undefined
}) {
  return (
    <WorkspacePageHeading
      title={title}
      actions={
        <>
          {actions}
          {editor?.enabled ? <DashboardLayoutActions editor={editor} /> : null}
        </>
      }
    />
  )
}

function DashboardLayoutActions({ editor }: { editor: Actions }) {
  const toolbar = useRef<HTMLDivElement>(null)
  const previousEditing = useRef(editor.editing)
  useEffect(() => {
    if (previousEditing.current !== editor.editing) {
      toolbar.current?.querySelector('button')?.focus()
      previousEditing.current = editor.editing
    }
  }, [editor.editing])

  return (
    <div ref={toolbar} className="flex flex-wrap gap-2">
      {editor.editing ? (
        <>
          <Button size="sm" variant="outline" onPress={editor.cancel}>
            Cancelar
          </Button>
          <Button size="sm" isDisabled={!editor.changed} onPress={editor.save}>
            Guardar diseño
          </Button>
        </>
      ) : (
        <IconButton label="Personalizar resumen" variant="ghost" onPress={editor.start}>
          <SlidersHorizontal aria-hidden="true" className="size-4" />
        </IconButton>
      )}
    </div>
  )
}

type ModuleOption<Id extends string> = {
  id: Id
  title: string
  description?: string
  minWidth: number
}

export function DashboardLayoutEditor<Layout extends DashboardLayout>({
  label,
  editor,
  options,
  notice,
  renderModule,
}: {
  label: string
  editor: DashboardLayoutController<Layout>
  options: readonly ModuleOption<Layout['modules'][number]['id']>[]
  notice?: string
  renderModule: (item: Layout['modules'][number]) => ReactNode
}) {
  const { layout, enabled, editing } = editor
  return (
    <div className="space-y-4">
      {editing ? <DashboardLayoutHelp onReset={editor.restore} /> : null}
      {editor.savedOnce && notice ? (
        <output className="text-muted-foreground block text-xs" aria-live="polite">
          {notice}
        </output>
      ) : null}
      <DashboardCanvas
        label={label}
        activeIds={layout.modules.map(({ id }) => id)}
        options={enabled ? options : []}
        onAdd={editor.add}
        onMove={editor.move}
        empty={
          <div className="border-border bg-card rounded-xl border border-dashed px-5 py-10 text-center">
            <h2 className="text-base font-semibold">Tu resumen está vacío</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {enabled
                ? 'Añade abajo los módulos que quieras mostrar.'
                : 'Pide a un administrador que configure los módulos del resumen.'}
            </p>
          </div>
        }
      >
        {layout.modules.map((module, index) => {
          const option = options.find(({ id }) => id === module.id)
          if (!option) return null
          return (
            <DashboardModule
              key={module.id}
              id={module.id}
              title={option.title}
              index={index}
              width={module.width}
              minWidth={option.minWidth}
              edit={
                editing
                  ? {
                      remove: () => editor.remove(module.id),
                      resize: (width) => editor.resize(module.id, width),
                    }
                  : undefined
              }
            >
              {renderModule(module)}
            </DashboardModule>
          )
        })}
      </DashboardCanvas>
    </div>
  )
}

function DashboardLayoutHelp({ onReset }: { onReset: () => void }) {
  return (
    <div className="border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-semibold">Organiza tus módulos</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Arrastra para ordenar o usa Espacio y las flechas. El ancho se aplica en pantallas
          grandes. Puedes añadir módulos al final.
        </p>
      </div>
      <Button size="sm" variant="ghost" onPress={onReset}>
        <ArrowCounterClockwise aria-hidden="true" className="size-4" /> Restaurar diseño
      </Button>
    </div>
  )
}

function DashboardCanvas<Id extends string>({
  label,
  activeIds,
  options,
  onAdd,
  onMove,
  empty,
  children,
}: {
  label: string
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
          <section
            ref={grid}
            aria-label={label}
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-12"
          >
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

function DashboardModule({
  id,
  title,
  index,
  width,
  minWidth,
  edit,
  children,
}: {
  id: string
  title: string
  index: number
  width: number
  minWidth: number
  edit: { remove: () => void; resize: (width: number) => void } | undefined
  children: ReactNode
}) {
  const { ref, handleRef, isDragging } = useSortable({ id, index, disabled: !edit })
  const sizes = dashboardModuleWidths(minWidth)
  const resizable = edit && sizes.length > 1
  return (
    <article
      ref={ref}
      aria-label={title}
      data-dashboard-module={id}
      tabIndex={-1}
      style={{ '--dashboard-span': width } as CSSProperties}
      className={`relative flex min-w-0 flex-col xl:col-span-(--dashboard-span) ${width > 6 ? 'md:max-xl:col-span-2' : ''} ${edit ? 'border-border bg-muted/30 rounded-xl border border-dashed p-2' : ''} ${isDragging ? 'z-10 opacity-70' : ''}`}
    >
      {edit ? (
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
          {resizable ? (
            <SelectField
              label={`Ancho de ${title}`}
              hideLabel
              searchable={false}
              value={String(width)}
              options={sizes.map((size) => ({
                value: String(size),
                label: `${size}/${dashboardGridColumns} columnas`,
              }))}
              onChange={(value) => edit.resize(snapDashboardWidth(Number(value), minWidth, width))}
            />
          ) : null}
          <IconButton label={`Quitar ${title}`} variant="ghost" onPress={edit.remove}>
            <X aria-hidden="true" className="size-4" />
          </IconButton>
        </div>
      ) : null}
      <div className="@container min-w-0 flex-1 [&>*]:h-full">{children}</div>
      {resizable ? (
        <DashboardResizeHandle
          title={title}
          width={width}
          minWidth={minWidth}
          onResize={edit.resize}
        />
      ) : null}
    </article>
  )
}

function DashboardResizeHandle({
  title,
  width,
  minWidth,
  onResize,
}: {
  title: string
  width: number
  minWidth: number
  onResize: (width: number) => void
}) {
  const resize = useRef<{ x: number; initialWidth: number; width: number; step: number } | null>(
    null,
  )

  function start(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return
    const grid = event.currentTarget.parentElement?.parentElement
    if (!grid) return
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0
    const step = (grid.getBoundingClientRect().width + gap) / dashboardGridColumns
    if (step <= 0) return
    resize.current = { x: event.clientX, initialWidth: width, width, step }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function change(event: PointerEvent<HTMLButtonElement>) {
    const active = resize.current
    if (!active || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const next = snapDashboardWidth(
      active.initialWidth + (event.clientX - active.x) / active.step,
      minWidth,
    )
    if (next === active.width) return
    active.width = next
    onResize(next)
  }

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Arrastrar para ajustar el ancho de ${title}`}
      title="Arrastra para cambiar el ancho"
      className="border-border bg-background text-muted-foreground hover:bg-muted absolute -right-1 -bottom-1 hidden size-8 touch-none items-center justify-center rounded-md border shadow-sm xl:flex xl:cursor-ew-resize"
      onPointerDown={start}
      onPointerMove={change}
      onPointerUp={change}
      onLostPointerCapture={() => {
        resize.current = null
      }}
      onPointerCancel={() => {
        if (resize.current) onResize(resize.current.initialWidth)
        resize.current = null
      }}
    >
      <ArrowsLeftRight aria-hidden="true" className="size-4" />
    </button>
  )
}
