import { Button, toast } from '@doscientos/ui'
import { useEffect, useId, useRef, useState } from 'react'

import { TextField } from '@/shared/ui/form'

import { transitionServiceVisit, type VisitSummary } from '../application/visit-actions'
import { VisitOccurrenceScope } from './visit-occurrence-scope'

export function VisitOccurrenceSkipForm({
  tenantId,
  visit,
  onDone,
  onCancel,
  onPendingChange,
}: {
  tenantId: string
  visit: VisitSummary
  onDone: () => Promise<void>
  onCancel: () => void
  onPendingChange: (pending: boolean) => void
}) {
  const title = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const inFlight = useRef(false)
  const operation = useRef<{ reason: string; id: string } | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const cleanReason = reason.trim()
  const valid =
    visit.status === 'scheduled' &&
    Boolean(visit.contract_occurrence_on) &&
    cleanReason.length > 0 &&
    cleanReason.length <= 500

  useEffect(() => {
    heading.current?.focus()
  }, [])

  async function save() {
    if (inFlight.current || !valid) return
    if (operation.current?.reason !== cleanReason) {
      operation.current = { reason: cleanReason, id: crypto.randomUUID() }
    }
    inFlight.current = true
    setBusy(true)
    setError('')
    onPendingChange(true)
    try {
      await transitionServiceVisit({
        tenantId,
        visitId: visit.id,
        expectedUpdatedAt: visit.updated_at,
        operationId: operation.current.id,
        nextStatus: 'skipped',
        reason: cleanReason,
      })
      await onDone()
      toast.success('Visita omitida')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Inténtalo de nuevo.')
    } finally {
      inFlight.current = false
      setBusy(false)
      onPendingChange(false)
    }
  }

  return (
    <section
      aria-labelledby={title}
      aria-busy={busy}
      className="bg-muted/40 mt-3 w-full min-w-0 space-y-3 rounded-lg border p-4"
    >
      <h4 id={title} ref={heading} tabIndex={-1} className="font-medium">
        Omitir «{visit.title}»
      </h4>
      <VisitOccurrenceScope visit={visit} action="skip" />
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          <TextField
            label="Motivo de la omisión"
            value={reason}
            onChange={setReason}
            maxLength={500}
            placeholder="Ejemplo: festivo acordado con el cliente"
          />
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              No se pudo omitir la visita: {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="destructive"
              className="max-sm:min-h-11"
              isDisabled={busy || !valid}
            >
              {busy ? 'Guardando…' : 'Confirmar omisión'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="max-sm:min-h-11"
              isDisabled={busy}
              onPress={onCancel}
            >
              Volver sin omitir
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  )
}
