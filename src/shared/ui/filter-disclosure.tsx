import { CaretDown, SlidersHorizontal } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

/** Keeps secondary filters available without occupying space until requested. */
export function FilterDisclosure({
  activeCount,
  children,
}: {
  activeCount: number
  children: ReactNode
}) {
  return (
    <details className="group max-w-full min-w-0">
      <summary
        aria-label={
          activeCount
            ? `Filtros adicionales, ${activeCount} ${activeCount === 1 ? 'activo' : 'activos'}`
            : 'Filtros adicionales'
        }
        className="border-border bg-background hover:bg-muted flex h-9 w-fit cursor-pointer list-none items-center gap-2 rounded-lg border px-3 text-sm font-medium [&::-webkit-details-marker]:hidden"
      >
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        Filtros {activeCount > 0 ? <span aria-hidden="true">({activeCount})</span> : null}
        <CaretDown aria-hidden="true" className="size-3 group-open:rotate-180" />
      </summary>
      <div className="mt-2 flex max-w-full flex-wrap items-end gap-2">{children}</div>
    </details>
  )
}
