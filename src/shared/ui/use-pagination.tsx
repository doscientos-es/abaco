import {
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectList,
  SelectTrigger,
  SelectValue,
} from '@doscientos/ui'
import { useState } from 'react'

/**
 * Client-side pagination. `resetKey` should change whenever the filters change so the
 * table goes back to the first page instead of showing an empty one.
 */
export function usePagination<T>(items: T[], resetKey: string, initialPageSize = 10) {
  const [state, setState] = useState({ page: 1, key: resetKey, pageSize: initialPageSize })
  const requested = state.key === resetKey ? state.page : 1
  const pageSize = state.pageSize
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(requested, pageCount)
  const start = (page - 1) * pageSize

  return {
    page,
    pageCount,
    total: items.length,
    pageItems: items.slice(start, start + pageSize),
    setPage: (next: number) => setState((current) => ({ ...current, page: next, key: resetKey })),
    setPageSize: (next: number) => setState({ page: 1, key: resetKey, pageSize: next }),
    pageSize,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, items.length),
  }
}

type Controller = ReturnType<typeof usePagination>

/** Footer under a table: "1–10 de 34" plus page buttons (hidden when there is one page). */
export function TablePagination({ controller, noun }: { controller: Controller; noun: string }) {
  const { page, pageCount, setPage, setPageSize, pageSize, from, to, total } = controller
  if (total === 0) return null
  return (
    <div className="border-border/70 -mt-2 flex flex-wrap items-center justify-between gap-3 border-t px-1 pt-3">
      <div className="flex items-center gap-2">
        <p className="text-muted-foreground text-sm tabular-nums">
          {from}–{to} de {total} {noun}
        </p>
        <span className="text-muted-foreground text-xs">·</span>
        <label className="sr-only" htmlFor={`page-size-${noun}`}>
          Filas por página
        </label>
        <Select
          selectedKey={String(pageSize)}
          onSelectionChange={(key) => {
            if (key !== null) setPageSize(Number(key))
          }}
        >
          <SelectTrigger
            id={`page-size-${noun}`}
            aria-label="Filas por página"
            className="h-8 w-[4.5rem]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectList>
              {[10, 25, 50].map((size) => (
                <SelectItem key={size} id={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectList>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs">por página</span>
      </div>
      <Pagination
        className="w-full"
        page={page}
        pageCount={pageCount}
        onPageChange={setPage}
        ariaLabel={`Paginación de ${noun}`}
      />
    </div>
  )
}
