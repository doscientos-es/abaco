import { Button, Card, CardContent } from '@doscientos/ui'
import { useEffect, useState } from 'react'

import { estimateTotals, milestoneAmounts } from '@/shared/domain/estimate'
import { isEstimateSignature } from '@/shared/domain/estimate-signature'
import { formLimits } from '@/shared/domain/form-limits'
import { formatEuros } from '@/shared/domain/money'
import type { EstimateSignature } from '@/shared/domain/types'
import { TextField } from '@/shared/ui/form'

import {
  loadPublicEstimate,
  respondToPublicEstimate,
  type PublicEstimate,
} from '../application/public-estimate-actions'
import { EstimateDocument } from './estimate-document'
import { PublicEstimateSignature } from './public-estimate-signature'
import { useEstimatePrint } from './use-estimate-print'

const errorTexts: Record<string, string> = {
  not_found: 'Este enlace no es válido o el presupuesto ya no está disponible.',
  expired: 'Este presupuesto ha caducado. Pide a la empresa que te envíe uno actualizado.',
  already_responded: 'Este presupuesto ya fue respondido.',
  name_required: 'Escribe tu nombre completo para aceptar.',
  name_too_long: 'El nombre no puede superar 120 caracteres.',
  signature_required: 'Dibuja tu firma antes de aceptar el presupuesto.',
  signature_invalid: 'No se pudo validar la firma. Vuelve a dibujarla.',
}

/** Page the client opens from the emailed link: no account, the token in the URL is the credential. */
export function PublicEstimatePage({ token }: { token: string }) {
  const { documentRef, print } = useEstimatePrint()
  const [state, setState] = useState<
    { loading: true } | { loading: false; data?: PublicEstimate; error?: string }
  >({
    loading: true,
  })
  const [name, setName] = useState('')
  const [signature, setSignature] = useState<EstimateSignature>([])
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    let cancelled = false
    void loadPublicEstimate(token).then((result) => {
      if (cancelled) return
      setState(
        result.ok ? { loading: false, data: result.data } : { loading: false, error: result.error },
      )
    })
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    const root = document.documentElement
    const alreadyScrollable = root.hasAttribute('data-public-estimate')
    root.setAttribute('data-public-estimate', '')
    return () => {
      if (!alreadyScrollable) root.removeAttribute('data-public-estimate')
    }
  }, [])

  async function respond(action: 'accept' | 'reject') {
    if (action === 'accept' && !isEstimateSignature(signature)) {
      setMessage(errorTexts.signature_required)
      return
    }
    setBusy(true)
    setMessage(undefined)
    try {
      const result = await respondToPublicEstimate(
        token,
        action,
        name,
        action === 'accept' ? signature : undefined,
      )
      if (result.ok) setState({ loading: false, data: result.data })
      else
        setMessage(
          errorTexts[result.error] ?? 'No se pudo registrar tu respuesta. Inténtalo de nuevo.',
        )
    } catch {
      setMessage('No se pudo registrar tu respuesta. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  if (state.loading)
    return <p className="text-muted-foreground p-8 text-center text-sm">Cargando presupuesto…</p>
  if (!state.data) {
    return (
      <p className="mx-auto max-w-md p-8 text-center text-sm">
        {errorTexts[state.error ?? ''] ??
          'No pudimos cargar el presupuesto. Inténtalo de nuevo en unos minutos.'}
      </p>
    )
  }

  const { estimate, tenant, client, publicationSource } = state.data
  const expired = estimate.validUntil < new Date().toISOString().slice(0, 10)
  const totalCents = estimateTotals(estimate).totalCents
  const firstPayment = milestoneAmounts(estimate.milestones, totalCents)[0]

  return (
    <main className="public-estimate-portal bg-muted/30 min-h-screen space-y-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="border-border bg-card mx-auto flex w-full max-w-5xl flex-col gap-3 rounded-xl border p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground text-sm">Presupuesto de {tenant.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{estimate.title}</h1>
          <p className="text-muted-foreground text-sm">
            Nº {estimate.number} · Válido hasta {estimate.validUntil}
          </p>
        </div>
        <p className="shrink-0 text-xl font-semibold tabular-nums sm:text-2xl">
          {formatEuros(totalCents)}
        </p>
      </header>
      {publicationSource === 'migration' ? (
        <p className="border-warning/40 bg-warning/5 mx-auto max-w-5xl rounded-lg border p-3 text-sm">
          Esta copia se reconstruyó con los datos disponibles durante una migración. Solicita a la
          empresa el documento original si necesitas comprobar su contenido histórico.
        </p>
      ) : null}
      <EstimateDocument
        estimate={estimate}
        client={client}
        tenant={tenant}
        documentRef={documentRef}
        paginated={false}
      />
      <Card className="mx-auto max-w-3xl print:hidden">
        <CardContent className="space-y-4 pt-6">
          {estimate.status === 'accepted' || estimate.status === 'rejected' ? (
            <p className="text-sm font-medium">
              {estimate.status === 'accepted' ? 'Presupuesto aceptado' : 'Presupuesto rechazado'}
              {estimate.respondedBy ? ` por ${estimate.respondedBy}` : ''}
              {estimate.respondedAt ? ` el ${estimate.respondedAt.slice(0, 10)}` : ''}. Gracias.
            </p>
          ) : expired ? (
            <p className="text-sm">{errorTexts.expired}</p>
          ) : (
            <>
              <TextField
                label="Tu nombre completo"
                value={name}
                onChange={setName}
                placeholder="Nombre y apellidos"
                minLength={2}
                maxLength={formLimits.respondentName}
                helper="Obligatorio para aceptar · máximo 120 caracteres."
              />
              <div className="space-y-2">
                <p className="text-sm font-medium">Firma del cliente</p>
                <PublicEstimateSignature
                  value={signature}
                  onChange={setSignature}
                  disabled={busy}
                />
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="border-border accent-primary mt-0.5 size-4 shrink-0 rounded"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.currentTarget.checked)}
                />
                <span>He leído y acepto este presupuesto y sus condiciones.</span>
              </label>
              <p className="text-muted-foreground text-xs">
                Al aceptar se guardarán tu nombre, firma dibujada, fecha y referencia del
                presupuesto.
              </p>
              {message ? <p className="text-destructive text-sm">{message}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  isDisabled={
                    busy || name.trim().length < 2 || !confirmed || !isEstimateSignature(signature)
                  }
                  onPress={() => void respond('accept')}
                >
                  {busy ? 'Guardando…' : 'Firmar y aceptar presupuesto'}
                </Button>
                <Button variant="outline" isDisabled={busy} onPress={() => void respond('reject')}>
                  Rechazar
                </Button>
              </div>
            </>
          )}
          <Button variant="outline" onPress={print}>
            Imprimir o guardar PDF
          </Button>
        </CardContent>
      </Card>
      {estimate.status === 'accepted' && tenant.iban ? (
        <Card className="mx-auto max-w-3xl print:hidden">
          <CardContent className="space-y-3 pt-6">
            <div>
              <h2 className="font-semibold">Pagar por transferencia bancaria</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {firstPayment
                  ? `Primer pago acordado: ${formatEuros(firstPayment.amountCents)}.`
                  : 'Consulta con la empresa el importe y el vencimiento acordados.'}
              </p>
            </div>
            <div className="bg-muted/60 space-y-1 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground text-xs">IBAN</p>
              <p className="font-mono font-medium break-all">{tenant.iban}</p>
              <p className="text-muted-foreground pt-2 text-xs">Concepto de la transferencia</p>
              <p className="font-medium">Presupuesto {estimate.number}</p>
            </div>
            <TransferCopyButtons iban={tenant.iban} reference={`Presupuesto ${estimate.number}`} />
            <p className="text-muted-foreground text-xs">
              La transferencia se realiza desde tu banco. Este enlace no confirma automáticamente el
              pago; la empresa lo registrará cuando lo reciba.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </main>
  )
}

function TransferCopyButtons({ iban, reference }: { iban: string; reference: string }) {
  const [copied, setCopied] = useState<string>()
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(`${label} copiado.`)
    } catch {
      setCopied('No se pudo copiar. Selecciona el texto y cópialo manualmente.')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onPress={() => void copy(iban, 'IBAN')}>
        Copiar IBAN
      </Button>
      <Button variant="outline" onPress={() => void copy(reference, 'Concepto')}>
        Copiar concepto
      </Button>
      <span className="text-muted-foreground text-xs" role="status" aria-live="polite">
        {copied}
      </span>
    </div>
  )
}
