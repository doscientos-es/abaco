import { Button, toast } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import {
  decideVisitBillingReview,
  listOpenVisitBillingReviews,
  type VisitBillingReview,
} from '../application/visit-billing-review-actions'
import {
  billingQueueCategories,
  type BillingQueueCategory,
  visitBillingQueueCategory,
} from '../domain/visit-billing-queue'

const queueLabels: Record<BillingQueueCategory, { title: string; hint: string }> = {
  evidence: {
    title: 'Falta comprobar el parte',
    hint: 'Sin parte cerrado o pendiente de revisar en oficina.',
  },
  decision: {
    title: 'Lista para decidir',
    hint: 'Parte revisado. Decide si está incluida o va aparte.',
  },
  amount: {
    title: 'Verificar importe y factura',
    hint: 'Marcada para facturar aparte. Comprueba si ya existe una factura y qué importe corresponde.',
  },
}

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
  const inFlight = useRef(false)
  const operations = useRef(new Map<string, string>())

  async function decide(decision: 'included' | 'bill_separately') {
    const cleanReason = reason.trim()
    if (!cleanReason || inFlight.current) {
      if (!cleanReason) toast.error('Indica el motivo de la decisión.')
      return
    }
    const key = `${decision}:${cleanReason}`
    let operationId = operations.current.get(key)
    if (!operationId) {
      operationId = crypto.randomUUID()
      operations.current.set(key, operationId)
    }
    inFlight.current = true
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
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <li className="border-border bg-card rounded-xl border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 break-words">
          <p className="font-medium">{review.visitTitle}</p>
          <p className="text-muted-foreground text-sm">
            {review.clientName} · {sourceLabels[review.sourceKind]} ·{' '}
            {new Date(review.createdAt).toLocaleDateString('es-ES')}
          </p>
        </div>
        {review.status === 'bill_separately' ? (
          <span className="text-warning text-sm font-medium">Facturar aparte</span>
        ) : null}
      </div>
      <p className="text-muted-foreground mt-2 text-sm">
        {review.reportGate === 'missing'
          ? 'Sin parte cerrado'
          : review.reportGate === 'unreviewed'
            ? 'Parte pendiente de revisión'
            : 'Parte revisado'}
      </p>
      {review.reportGate === 'unreviewed' ? (
        <Link
          className="text-primary inline-flex min-h-11 items-center text-sm font-medium underline"
          to="/trabajos"
          search={{ tab: 'revision' }}
        >
          Ir a partes por revisar
        </Link>
      ) : null}
      {review.status === 'bill_separately' ? (
        <Link
          className="text-primary inline-flex min-h-11 items-center text-sm font-medium underline"
          to="/clientes/$clientId"
          params={{ clientId: review.clientId }}
        >
          Abrir ficha del cliente
        </Link>
      ) : null}
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
              className="max-md:min-h-11"
              variant="outline"
              isDisabled={busy}
              onPress={() => void decide('included')}
            >
              Incluida en el acuerdo
            </Button>
            <Button
              className="max-md:min-h-11"
              size="sm"
              isDisabled={busy}
              onPress={() => void decide('bill_separately')}
            >
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
    await queryClient.invalidateQueries({ queryKey: ['visit-billing-reviews', tenantId] })
  }

  return (
    <section className="space-y-2" aria-label="Visitas pendientes de facturación">
      <div>
        <h2 className="text-base font-semibold">Visitas hechas por revisar</h2>
        <p className="text-muted-foreground text-xs sm:text-sm">
          Revisa el parte, decide si la visita va aparte y comprueba sus facturas antes de emitir.
          Esta bandeja no confirma que una visita esté sin facturar ni emite documentos.
        </p>
      </div>
      {reviews.isPending ? <p className="text-sm">Cargando visitas…</p> : null}
      {reviews.isError ? (
        <div role="alert" className="border-destructive rounded-xl border p-3">
          <p className="text-destructive text-sm">No se pudo comprobar el estado de las visitas.</p>
          <Button
            className="mt-2 max-md:min-h-11"
            size="sm"
            variant="outline"
            onPress={() => void reviews.refetch()}
          >
            Reintentar
          </Button>
        </div>
      ) : null}
      {reviews.isSuccess && !reviews.data.length ? (
        <p className="text-muted-foreground text-sm">No hay visitas pendientes.</p>
      ) : null}
      {reviews.isSuccess && reviews.data.length ? (
        <div className="space-y-5">
          {billingQueueCategories.map((category) => {
            const items = reviews.data.filter(
              (review) => visitBillingQueueCategory(review) === category,
            )
            if (!items.length) return null
            const { title, hint } = queueLabels[category]
            return (
              <section key={category} aria-label={title} className="space-y-2">
                <div>
                  <h3 className="text-sm font-semibold">
                    {title} · {items.length}
                  </h3>
                  <p className="text-muted-foreground text-xs">{hint}</p>
                </div>
                <ul className="space-y-2">
                  {items.map((review) => (
                    <ReviewItem
                      key={review.visitId}
                      review={review}
                      tenantId={tenantId}
                      refresh={refresh}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
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
          <span className="text-sm">Página {page + 1} · recuentos de esta página</span>
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
