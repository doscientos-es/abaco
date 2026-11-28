import { Button, toast } from '@doscientos/ui'
import { Link } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'

import { formatEuros } from '@/shared/domain/money'

import {
  type CoverageInvoice,
  findIssuedVisitInvoice,
  setVisitInvoiceCoverage,
  type VisitBillingReview,
} from '../application/visit-billing-review-actions'

const date = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: 'UTC' })

export function VisitInvoiceCoverage({
  review,
  tenantId,
  refresh,
}: {
  review: VisitBillingReview
  tenantId: string
  refresh: () => Promise<void>
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [candidate, setCandidate] = useState<CoverageInvoice | null>(null)
  const [fullCoverage, setFullCoverage] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const retry = useRef<{ payload: string; operationId: string } | null>(null)
  const linked = review.coverageInvoiceId !== null
  const lookupField = useRef<HTMLInputElement>(null)
  const reasonField = useRef<HTMLTextAreaElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  useEffect(() => {
    if (open) {
      const field = linked ? reasonField.current : lookupField.current
      field?.focus()
    } else if (returnFocus.current) {
      returnFocus.current = false
      trigger.current?.focus()
    }
  }, [linked, open])

  async function perform(task: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setMessage('')
    try {
      await task()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Inténtalo de nuevo.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  function reset(restoreFocus = false) {
    returnFocus.current = restoreFocus
    setOpen(false)
    setReason('')
    setInvoiceNumber('')
    setCandidate(null)
    setFullCoverage(false)
    setMessage('')
    retry.current = null
  }

  function search() {
    const number = invoiceNumber.trim()
    setCandidate(null)
    setFullCoverage(false)
    if (!number) {
      setMessage('Escribe el número de la factura emitida.')
      return
    }
    void perform(async () => {
      const found = await findIssuedVisitInvoice(tenantId, review.clientId, number)
      setCandidate(found)
      if (!found) setMessage('No se encontró una factura emitida con ese número para este cliente.')
    })
  }

  function save() {
    const invoiceId = linked ? review.coverageInvoiceId : candidate?.id
    const cleanReason = reason.trim()
    if (!invoiceId || !cleanReason || (!linked && !fullCoverage)) {
      setMessage('Indica el motivo y confirma que la factura cubre toda la visita.')
      return
    }
    const action = linked ? 'detach' : 'attach'
    const payload = JSON.stringify([action, invoiceId, cleanReason])
    const operationId =
      retry.current?.payload === payload ? retry.current.operationId : crypto.randomUUID()
    retry.current = { payload, operationId }
    void perform(async () => {
      await setVisitInvoiceCoverage({
        tenantId,
        visitId: review.visitId,
        invoiceId,
        action,
        confirmFullCoverage: !linked,
        reason: cleanReason,
        operationId,
      })
      reset()
      await refresh()
      toast.success(linked ? 'Visita devuelta a revisión' : 'Factura vinculada a la visita')
    })
  }

  return (
    <div className="mt-3 space-y-2">
      {review.coverageInvoiceId ? (
        <p className="text-sm">
          Factura vinculada:{' '}
          {review.coverageInvoiceNumber ? (
            <Link
              className="text-primary inline-flex min-h-11 items-center font-medium underline"
              to="/facturas/$invoiceId"
              params={{ invoiceId: review.coverageInvoiceId }}
            >
              {review.coverageInvoiceNumber}
            </Link>
          ) : (
            <span>número no disponible</span>
          )}
        </p>
      ) : null}
      {!open ? (
        <Button
          ref={trigger}
          type="button"
          size="sm"
          variant="outline"
          className="max-md:min-h-11"
          onPress={() => setOpen(true)}
        >
          {linked ? 'Desvincular factura' : 'Vincular factura emitida'}
        </Button>
      ) : (
        <div className="border-border space-y-3 rounded-lg border p-3" aria-busy={busy}>
          {!linked ? (
            <>
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  search()
                }}
              >
                <label htmlFor={`${id}-number`} className="block text-sm font-medium">
                  Número de la factura emitida
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={lookupField}
                    id={`${id}-number`}
                    autoComplete="off"
                    maxLength={80}
                    disabled={busy}
                    value={invoiceNumber}
                    className="border-input bg-background min-h-11 min-w-0 flex-1 rounded-lg border px-3 py-2 text-base"
                    onChange={(event) => {
                      setInvoiceNumber(event.target.value)
                      setCandidate(null)
                      setFullCoverage(false)
                      setMessage('')
                    }}
                  />
                  <Button type="submit" size="sm" isDisabled={busy} className="max-md:min-h-11">
                    Buscar factura
                  </Button>
                </div>
              </form>
              <output className="sr-only">{candidate ? 'Factura encontrada.' : ''}</output>
              {candidate ? (
                <div className="bg-muted space-y-2 rounded-lg p-3 text-sm">
                  <p className="font-medium">{candidate.number}</p>
                  <p className="break-words">{candidate.concept}</p>
                  <p>
                    {date.format(new Date(candidate.issued_at))} ·{' '}
                    {formatEuros(candidate.total_cents)} emitidos
                  </p>
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={fullCoverage}
                      disabled={busy}
                      className="accent-primary size-5 shrink-0"
                      onChange={(event) => setFullCoverage(event.target.checked)}
                    />
                    He comprobado que esta factura cubre toda la visita.
                  </label>
                </div>
              ) : null}
              <p className="text-muted-foreground text-xs">
                Vincular no emite ni cobra nada. Si la factura es externa, parcial o no sabes si
                cubre la visita, déjala sin confirmar.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              La visita volverá a la bandeja. No se modifica la factura y el vínculo anterior queda
              en el historial.
            </p>
          )}
          {linked || candidate ? (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault()
                save()
              }}
            >
              <label htmlFor={`${id}-reason`} className="block text-sm font-medium">
                {linked ? 'Motivo para desvincular' : 'Motivo de la confirmación'}
              </label>
              <textarea
                ref={reasonField}
                id={`${id}-reason`}
                value={reason}
                maxLength={1000}
                disabled={busy}
                className="border-input bg-background block min-h-16 w-full rounded-lg border p-2 text-base"
                onChange={(event) => setReason(event.target.value)}
              />
              <Button type="submit" size="sm" isDisabled={busy} className="max-md:min-h-11">
                {linked ? 'Confirmar desvinculación' : 'Confirmar cobertura de la visita'}
              </Button>
            </form>
          ) : null}
          {message ? (
            <p role="alert" className="text-destructive text-sm">
              {message}
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            isDisabled={busy}
            className="max-md:min-h-11"
            onPress={() => reset(true)}
          >
            Cancelar
          </Button>
        </div>
      )}
    </div>
  )
}
