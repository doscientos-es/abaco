import { useQuery } from '@tanstack/react-query'

import { useSession } from '@/features/auth'

import { loadIncidentQuoteDraftContext } from '../application/incident-quote-actions'
import { IncidentQuotePhotoPreview } from './incident-quote-photo'

export function IncidentQuoteDraftContext({
  tenantId,
  estimateId,
  clientId,
  unpriced,
}: {
  tenantId: string
  estimateId: string
  clientId: string
  unpriced: boolean
}) {
  const session = useSession()
  const context = useQuery({
    queryKey: ['incident-quote-draft-context', tenantId, session?.userId, estimateId, clientId],
    queryFn: () => loadIncidentQuoteDraftContext(tenantId, estimateId),
    enabled: session?.role === 'admin' && session.tenantId === tenantId,
    gcTime: 0,
    refetchOnMount: 'always',
  })
  const data = context.data
  if (!data || data.client_id !== clientId) return null
  const visitId = data.visit_id
  return (
    <section
      aria-label="Hallazgo de origen · Información interna"
      className="border-border bg-muted/30 min-w-0 space-y-3 rounded-lg border p-3 sm:p-4"
    >
      <h2 className="font-semibold">Hallazgo de origen · Información interna</h2>
      <p className="text-muted-foreground text-sm">
        Centro revisado: <strong>{data.centre_name || 'Sin centro asociado'}</strong>
        {data.centre_address ? ` · ${data.centre_address}` : ''}
      </p>
      {unpriced ? (
        <p className="border-warning rounded-md border p-2 text-sm">
          Hay partidas pendientes de valorar. Revisa los importes antes de compartir el presupuesto.
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">
        Las fotos seleccionadas son referencias internas. No aparecen en el PDF ni en el enlace del
        cliente.
      </p>
      {visitId && data.photos.length ? (
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {data.photos.map((photo, index) => (
            <IncidentQuotePhotoPreview
              key={photo.id}
              tenantId={tenantId}
              visitId={visitId}
              photo={photo}
              number={index + 1}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">No hay fotos referenciadas.</p>
      )}
    </section>
  )
}
