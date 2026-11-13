import { Button, Popover } from '@doscientos/ui'
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
    <Popover
      placement="bottom start"
      className="max-h-[80dvh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-4"
      trigger={
        <Button
          variant="outline"
          aria-label={
            activeCount
              ? `Filtros adicionales, ${activeCount} ${activeCount === 1 ? 'activo' : 'activos'}`
              : 'Filtros adicionales'
          }
          className="h-9 gap-2 px-3"
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          Filtros {activeCount > 0 ? <span aria-hidden="true">({activeCount})</span> : null}
          <CaretDown aria-hidden="true" className="size-3" />
        </Button>
      }
    >
      <div className="flex flex-col items-start gap-3">{children}</div>
    </Popover>
  )
}
