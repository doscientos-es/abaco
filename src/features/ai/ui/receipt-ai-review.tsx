import { Button } from '@doscientos/ui'
import { Sparkle } from '@phosphor-icons/react'
import { useState } from 'react'

import { formatEuros } from '@/shared/domain/money'

import { aiDocument, requestSuggestion } from '../application/ai-actions'
import type { ReceiptSuggestion } from '../domain/suggestions'

export function ReceiptAiReview({
  tenantId,
  file,
  onApply,
}: {
  tenantId: string
  file: File
  onApply: (suggestion: ReceiptSuggestion) => void
}) {
  const [suggestion, setSuggestion] = useState<ReceiptSuggestion | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function analyze() {
    if (busy) return
    setBusy(true)
    setError('')
    setSuggestion(null)
    try {
      const document = await aiDocument(file)
      setSuggestion(await requestSuggestion(tenantId, { task: 'receipt', document }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo analizar la factura.')
    } finally {
      setBusy(false)
    }
  }

  const fields = suggestion
    ? [
        ['Fecha', suggestion.date],
        ['Concepto', suggestion.concept],
        ['Categoría', suggestion.category],
        [
          'Total con IVA',
          suggestion.grossCents === null ? null : formatEuros(suggestion.grossCents),
        ],
        ['IVA', suggestion.vatRate === null ? null : `${suggestion.vatRate} %`],
      ].filter(([, value]) => value !== null)
    : []

  return (
    <section
      className="border-primary/20 bg-primary/5 space-y-3 rounded-xl border p-4"
      aria-label="Análisis de factura con IA"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Completar con IA</p>
          <p className="text-muted-foreground text-xs">
            Revisa los datos detectados antes de aplicarlos.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          isDisabled={busy}
          onPress={() => void analyze()}
        >
          <Sparkle aria-hidden="true" className="size-4" />{' '}
          {busy ? 'Analizando…' : suggestion ? 'Analizar de nuevo' : 'Analizar factura'}
        </Button>
      </div>
      {busy ? (
        <output className="text-muted-foreground block text-sm">
          Leyendo la factura y comprobando sus importes…
        </output>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {suggestion && !busy ? (
        <>
          {fields.length ? (
            <dl className="divide-border bg-card divide-y rounded-lg border">
              {fields.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 p-2 text-sm">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right break-words">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">
              No se han detectado datos fiables. Puedes completarlos manualmente.
            </p>
          )}
          {fields.length ? (
            <Button
              type="button"
              size="sm"
              onPress={() => {
                onApply(suggestion)
                setSuggestion(null)
              }}
            >
              Aplicar datos revisados
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
