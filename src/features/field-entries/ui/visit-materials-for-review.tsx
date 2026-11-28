import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { listVisitMaterialsForReview } from '../application/field-entry-actions'

export function VisitMaterialsForReview({
  tenantId,
  visitId,
}: {
  tenantId: string
  visitId: string
}) {
  const [page, setPage] = useState(0)
  const query = useQuery({
    queryKey: ['visit-materials-for-review', tenantId, visitId, page],
    queryFn: () => listVisitMaterialsForReview(tenantId, visitId, page),
  })
  const items = query.data?.entries ?? []

  return (
    <section
      aria-label="Materiales marcados para oficina"
      className="border-border space-y-2 rounded-lg border p-3 text-sm"
    >
      <h3 className="font-semibold">Materiales marcados para oficina</h3>
      <p className="text-muted-foreground">
        Marca interna del parte. No genera cargos ni descuenta stock.
      </p>
      {query.isPending ? (
        <output className="text-muted-foreground">Cargando materiales…</output>
      ) : null}
      {query.isError ? (
        <div className="space-y-2">
          <p role="alert">No se pudieron consultar los materiales marcados.</p>
          <Button variant="outline" size="sm" onPress={() => void query.refetch()}>
            Reintentar materiales
          </Button>
        </div>
      ) : null}
      {query.isSuccess && !items.length ? (
        <p className="text-muted-foreground">No hay materiales marcados en esta página.</p>
      ) : null}
      {items.length ? (
        <ul className="divide-border divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span className="min-w-0 wrap-anywhere">{item.description}</span>
              <strong className="tabular-nums">
                {new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(item.quantity)}{' '}
                {item.unit}
              </strong>
            </li>
          ))}
        </ul>
      ) : null}
      {page > 0 || query.data?.hasMore ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            isDisabled={page === 0}
            onPress={() => setPage((value) => value - 1)}
          >
            Anterior
          </Button>
          <span>Página {page + 1}</span>
          <Button
            size="sm"
            variant="outline"
            isDisabled={!query.data?.hasMore || page >= 250}
            onPress={() => setPage((value) => value + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </section>
  )
}
