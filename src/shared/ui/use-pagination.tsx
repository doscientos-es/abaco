import { Pagination } from '@doscientos/ui'
import { useState } from 'react'

/**
 * Client-side pagination. `resetKey` should change whenever the filters change so the
 * table goes back to the first page instead of showing an empty one.
 */
export function usePagination<T>(items: T[], resetKey: string, pageSize = 10) {
  const [state, setState] = useState({ page: 1, key: resetKey })
  const requested = state.key === resetKey ? state.page : 1
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(requested, pageCount)
  const start = (page - 1) * pageSize

  return {
    page,
    pageCount,
    total: items.length,
    pageItems: items.slice(start, start + pageSize),
    setPage: (next: number) => setState({ page: next, key: resetKey }),
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, items.length),
  }
}

type Controller = ReturnType<typeof usePagination>

/** Footer under a table: "1–10 de 34" plus page buttons (hidden when there is one page). */
export function TablePagination({ controller, noun }: { controller: Controller; noun: string }) {
  const { page, pageCount, setPage, from, to, total } = controller
  if (total === 0) return null
  return (
    <div className="border-border/70 -mt-2 flex flex-wrap items-center justify-between gap-3 px-1">
      <Pagination
        className="w-full"
        page={page}
        pageCount={pageCount}
        onPageChange={setPage}
        ariaLabel={`Paginación de ${noun}`}
        summary={
          <span className="tabular-nums">
            {from}–{to} de {total} {noun}
          </span>
        }
      />
    </div>
  )
}
