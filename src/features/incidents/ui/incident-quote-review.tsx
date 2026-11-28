import { Button } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'

import { useSession } from '@/features/auth'
import { useActionLock } from '@/shared/lib/use-action-lock'
import { TextareaField, TextField } from '@/shared/ui/form'

import type { Incident } from '../application/incident-actions'
import {
  createIncidentQuoteDraft,
  loadIncidentQuoteReview,
  type IncidentQuoteReview,
} from '../application/incident-quote-actions'
import { IncidentQuotePhotoPreview } from './incident-quote-photo'

export function IncidentQuoteReviewPanel({
  tenantId,
  incident,
  onCreated,
}: {
  tenantId: string
  incident: Incident
  onCreated: (estimateId: string) => Promise<void>
}) {
  const userId = useSession()?.userId
  const heading = useId()
  const review = useQuery({
    queryKey: ['incident-quote-review', tenantId, userId, incident.id, incident.updated_at],
    queryFn: () => loadIncidentQuoteReview(tenantId, incident.id),
    gcTime: 0,
    refetchOnMount: 'always',
  })
  return (
    <section
      aria-labelledby={heading}
      className="border-border bg-muted/30 min-w-0 space-y-3 rounded-lg border p-3 sm:p-4"
    >
      <h5 id={heading} className="font-semibold">
        Revisar borrador de presupuesto
      </h5>
      {review.isPending ? <output>Comprobando cliente y centro…</output> : null}
      {review.isError ? (
        <div className="space-y-2">
          <p role="alert" className="text-destructive">
            No se pudo cargar la revisión.
          </p>
          <Button variant="outline" size="sm" onPress={() => void review.refetch()}>
            Reintentar revisión
          </Button>
        </div>
      ) : null}
      {review.isSuccess ? (
        <ReviewForm
          key={review.data.incident_version}
          tenantId={tenantId}
          incident={incident}
          review={review.data}
          onCreated={onCreated}
        />
      ) : null}
    </section>
  )
}

function ReviewForm({
  tenantId,
  incident,
  review,
  onCreated,
}: {
  tenantId: string
  incident: Incident
  review: IncidentQuoteReview
  onCreated: (estimateId: string) => Promise<void>
}) {
  const [title, setTitle] = useState(incident.title)
  const [lines, setLines] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const operation = useRef<{ inputs: string; operationId: string } | null>(null)
  const lock = useActionLock()
  const visitId = review.visit_id
  const labels = lines
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const valid =
    title.trim().length > 0 &&
    labels.length > 0 &&
    labels.length <= 10 &&
    labels.every((line) => Array.from(line).length <= 160 && !/\p{Cc}/u.test(line))

  async function submit() {
    if (!valid || !confirmed || busy || !lock.acquire()) return
    const inputs = JSON.stringify([title.trim(), labels, selected])
    if (operation.current?.inputs !== inputs)
      operation.current = { inputs, operationId: crypto.randomUUID() }
    setBusy(true)
    setError('')
    try {
      const estimateId = await createIncidentQuoteDraft({
        tenantId,
        incidentId: incident.id,
        review,
        title: title.trim(),
        lines: labels,
        photoIds: selected,
        operationId: operation.current.operationId,
      })
      await onCreated(estimateId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo confirmar el borrador.')
    } finally {
      setBusy(false)
      lock.release()
    }
  }

  return (
    <fieldset className="min-w-0 space-y-3" disabled={busy}>
      <dl className="bg-card grid gap-2 rounded-md p-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Cliente</dt>
          <dd className="font-medium wrap-anywhere">{review.client_name}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Centro del hallazgo</dt>
          <dd className="font-medium wrap-anywhere">
            {review.centre_name || 'Sin centro asociado'}
          </dd>
          {review.centre_address ? (
            <dd className="wrap-anywhere">{review.centre_address}</dd>
          ) : null}
        </div>
      </dl>
      <TextField
        label="Título del borrador"
        value={title}
        maxLength={200}
        placeholder="Título que puede leer el cliente"
        onChange={(value) => {
          setTitle(value)
          setConfirmed(false)
        }}
      />
      <TextareaField
        label="Partidas pendientes de valorar"
        value={lines}
        maxLength={1610}
        placeholder="Escribe una partida por línea"
        helper="De 1 a 10 partidas de hasta 160 caracteres. Revisa los importes en el borrador."
        onChange={(value) => {
          setLines(value)
          setConfirmed(false)
        }}
      />
      {labels.length > 0 && !valid ? (
        <p role="alert">Revisa la longitud del título o las partidas.</p>
      ) : null}
      {visitId && review.photos.length ? (
        <div className="space-y-2">
          <p className="font-medium">Fotos de la visita de origen</p>
          <p className="text-muted-foreground">
            Opcionales, hasta 5. Abre cada foto antes de seleccionarla. Solo serán referencias
            internas: nunca se adjuntan al documento del cliente.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {review.photos.map((photo, index) => (
              <IncidentQuotePhotoPreview
                key={photo.id}
                tenantId={tenantId}
                visitId={visitId}
                photo={photo}
                number={index + 1}
                authorization={{
                  selected: selected.includes(photo.id),
                  disabled: busy || (selected.length === 5 && !selected.includes(photo.id)),
                  onChange: (checked) => {
                    setSelected((previous) =>
                      checked ? [...previous, photo.id] : previous.filter((id) => id !== photo.id),
                    )
                    setConfirmed(false)
                  },
                }}
              />
            ))}
          </ul>
        </div>
      ) : null}
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          className="accent-primary size-5 shrink-0"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        He revisado el cliente, el centro y el contenido del borrador
      </label>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        className="min-h-11 max-sm:w-full"
        isDisabled={!valid || !confirmed || busy}
        onPress={() => void submit()}
      >
        {busy ? 'Creando borrador…' : 'Crear borrador sin enviar'}
      </Button>
    </fieldset>
  )
}
