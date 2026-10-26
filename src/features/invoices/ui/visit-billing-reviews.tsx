import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import {
  decideVisitBillingReview,
  listOpenVisitBillingReviews,
  type VisitBillingReview,
} from '../application/visit-billing-review-actions'

const sourceLabels: Record<VisitBillingReview['sourceKind'], string> = {
  contract: 'Contrato',
  work_order: 'Trabajo',
  standalone: 'Visita puntual',
}

function ReviewItem({
  review,
  tenantId,
  refresh,
}: {
  review: VisitBillingReview
  tenantId: string
  refresh: () => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const operations = useRef(new Map<string, string>())

  async function decide(decision: 'included' | 'bill_separately') {
    const cleanReason = reason.trim()
    if (!cleanReason || busy) {
      if (!cleanReason) toast.error('Indica el motivo de la decisión.')
      return
    }
    const key = `${decision}:${cleanReason}`
    let operationId = operations.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operations.current.set(key, operationId)
    }
    setBusy(true)
    try {
      await decideVisitBillingReview({
        tenantId,
        visitId: review.visitId,
        decision,
        reason: cleanReason,
        operationId,
      })
      operations.current.delete(key)
      await refresh()
      toast.success(
        decision === 'included' ? 'Visita marcada como incluida' : 'Visita pendiente de factura',
      )
    } catch (error) {
      toast.error('No se pudo revisar la visita', {
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="border-border rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{review.visitTitle}</p>
          <p className="text-muted-foreground text-sm">
            {review.clientName} · {sourceLabels[review.sourceKind]} ·{' '}
            {new Date(review.createdAt).toLocaleDateString('es-ES')}
          </p>
        </div>
        {review.status === 'bill_separately' ? (
          <span className="text-warning text-sm font-medium">Pendiente de factura</span>
        ) : null}
      </div>
      {review.status === 'pending' ? (
        <>
          <label className="mt-3 block text-sm">
            Motivo de la decisión
            <input
              value={reason}
              maxLength={1000}
              disabled={busy}
              className="border-input bg-background mt-1 block w-full rounded-lg border px-3 py-2"
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              isDisabled={busy}
              onPress={() => void decide('included')}
            >
              Incluida en el acuerdo
            </Button>
            <Button size="sm" isDisabled={busy} onPress={() => void decide('bill_separately')}>
              Facturar aparte
            </Button>
          </div>
        </>
      ) : null}
    </li>
  )
}

export function VisitBillingReviews({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const queryKey = ['visit-billing-reviews', tenantId, page]
  const reviews = useQuery({ queryKey, queryFn: () => listOpenVisitBillingReviews(tenantId, page) })

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey })
  }

  return (
    <section className="space-y-3" aria-label="Visitas pendientes de facturación">
      <div>
        <h2 className="text-lg font-semibold">Visitas pendientes de facturación</h2>
        <p className="text-muted-foreground text-sm">
          Decide si la visita está incluida en un contrato o trabajo, o si necesita una factura
          aparte. Esta decisión no emite una factura.
        </p>
      </div>
      {reviews.isPending ? <p className="text-sm">Cargando visitas…</p> : null}
      {reviews.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron cargar las visitas pendientes.
        </p>
      ) : null}
      {reviews.isSuccess && !reviews.data.length ? (
        <p className="text-muted-foreground text-sm">No hay visitas pendientes.</p>
      ) : null}
      {reviews.data?.length ? (
        <ul className="space-y-2">
          {reviews.data.map((review) => (
            <ReviewItem
              key={review.visitId}
              review={review}
              tenantId={tenantId}
              refresh={refresh}
            />
          ))}
        </ul>
      ) : null}
      {reviews.isSuccess && (page > 0 || reviews.data.length === 50) ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            isDisabled={page === 0}
            onPress={() => setPage((current) => current - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm">Página {page + 1}</span>
          <Button
            size="sm"
            variant="outline"
            isDisabled={reviews.data.length < 50}
            onPress={() => setPage((current) => current + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </section>
  )
}
