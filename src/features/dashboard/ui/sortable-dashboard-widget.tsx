import { useSortable } from '@dnd-kit/react/sortable'
import { DotsSixVertical, X } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import type { DashboardWidgetId } from '../domain/dashboard-config'

export function SortableDashboardWidget({
  id,
  index,
  title,
  fullWidth,
  editing,
  onRemove,
  children,
}: {
  id: DashboardWidgetId
  index: number
  title: string
  fullWidth: boolean
  editing: boolean
  onRemove: (id: DashboardWidgetId) => void
  children: ReactNode
}) {
  const { ref, handleRef, isDragging } = useSortable({ id, index, disabled: !editing })

  return (
    <article
      ref={ref}
      className={`relative min-w-0 ${fullWidth ? 'md:col-span-2' : ''} ${editing ? 'outline-border-strong rounded-xl outline outline-1 outline-dashed' : ''} ${isDragging ? 'z-10 opacity-70 shadow-lg' : ''}`}
      aria-label={title}
    >
      {editing ? (
        <div className="border-border bg-background absolute -top-3 right-3 z-20 flex items-center gap-1 rounded-lg border p-1 shadow-sm">
          <button
            ref={handleRef}
            type="button"
            aria-label={`Arrastrar ${title} para cambiar su posición`}
            title="Arrastra para cambiar el orden; también puedes usar las flechas del teclado."
            className="text-muted-foreground hover:bg-muted flex size-8 cursor-grab items-center justify-center rounded-md active:cursor-grabbing"
          >
            <DotsSixVertical aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-label={`Quitar ${title} del resumen`}
            onClick={() => onRemove(id)}
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 items-center justify-center rounded-md"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}
      {children}
    </article>
  )
}
