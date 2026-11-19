import { Button } from '@doscientos/ui'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { Fragment, useState } from 'react'

import { useTenantData } from '@/shared/store/store'

import { invoiceDraftsQueryKey, listOpenInvoiceDrafts } from '../application/invoice-draft-actions'
import { invoiceDraftSources, type InvoiceDraftSource } from '../domain/invoice-draft'
import { InvoiceDraftItem } from './invoice-draft-item'

const groups = {
  milestone: { label: 'Hitos', error: 'No se pudieron cargar los borradores.' },
  work_extra: { label: 'Extras', error: 'No se pudieron cargar los borradores de extras.' },
  contract_period: {
    label: 'Contratos',
    error: 'No se pudieron cargar los borradores de contratos.',
  },
} satisfies Record<InvoiceDraftSource, { label: string; error: string }>

export function InvoiceDrafts({ tenantId }: { tenantId: string }) {
  const { tenant } = useTenantData()
  const library = tenant.id === tenantId ? tenant.documentLibrary : undefined
  const queryClient = useQueryClient()
  const [pages, setPages] = useState<Partial<Record<InvoiceDraftSource, number>>>({})
  const queries = useQueries({
    queries: invoiceDraftSources.map((source) => {
      const page = pages[source] ?? 0
      return {
        queryKey: [...invoiceDraftsQueryKey(source, tenantId), page],
        queryFn: () => listOpenInvoiceDrafts(source, tenantId, page),
      }
    }),
  })

  async function refresh() {
    await Promise.all(
      invoiceDraftSources.map((source) =>
        queryClient.invalidateQueries({ queryKey: invoiceDraftsQueryKey(source, tenantId) }),
      ),
    )
  }

  const loading = queries.some(({ isPending }) => isPending)
  const empty = queries.every(({ isSuccess, data }) => isSuccess && data?.items.length === 0)

  return (
    <section className="space-y-2" aria-label="Borradores de factura">
      <div>
        <h2 className="text-base font-semibold">Borradores de factura</h2>
        <p className="text-muted-foreground text-xs sm:text-sm">
          Revisa el concepto y el vencimiento antes de emitir. El borrador no tiene número de
          factura.
        </p>
      </div>
      {loading ? <p className="text-sm">Cargando borradores…</p> : null}
      {empty ? (
        <p className="text-muted-foreground text-sm">No hay borradores pendientes.</p>
      ) : null}
      {invoiceDraftSources.map((source, index) => {
        const result = queries[index]
        const items = result?.data?.items ?? []
        const page = pages[source] ?? 0
        const hasMore = result?.data?.hasMore ?? false
        const { label, error } = groups[source]
        return (
          <Fragment key={source}>
            {result?.isError ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            {items.length > 0 ? (
              <ul className="space-y-3" aria-label={`Borradores: ${label}`}>
                {items.map((draft) => (
                  <InvoiceDraftItem
                    key={draft.id}
                    draft={draft}
                    refresh={refresh}
                    library={library}
                  />
                ))}
              </ul>
            ) : null}
            {page > 0 || hasMore ? (
              <DraftPagination
                label={label}
                page={page}
                hasMore={hasMore}
                onChange={(next) => setPages((previous) => ({ ...previous, [source]: next }))}
              />
            ) : null}
          </Fragment>
        )
      })}
    </section>
  )
}

function DraftPagination({
  label,
  page,
  hasMore,
  onChange,
}: {
  label: string
  page: number
  hasMore: boolean
  onChange: (page: number) => void
}) {
  return (
    <nav aria-label={`Páginas de borradores: ${label}`} className="flex items-center gap-2 text-sm">
      <span>{label}</span>
      <Button
        size="sm"
        variant="outline"
        isDisabled={page === 0}
        onPress={() => onChange(page - 1)}
      >
        Anterior
      </Button>
      <span>Página {page + 1}</span>
      <Button size="sm" variant="outline" isDisabled={!hasMore} onPress={() => onChange(page + 1)}>
        Siguiente
      </Button>
    </nav>
  )
}
