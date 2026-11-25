import { Button } from '@doscientos/ui'
import { Sparkle } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import { receiptUpload } from '@/shared/domain/upload-file'
import { UploadFileField } from '@/shared/ui/upload-file-field'

import { createReceiptAnalysis } from '../application/receipt-analysis'
import type { ReceiptSuggestion } from '../domain/suggestions'

export function ReceiptAiReview({
  tenantId,
  file,
  onFileChange,
  onApply,
  canAnalyze,
  checkingAccess,
  onBusyChange,
  onAnalysisStart,
}: {
  tenantId: string
  file: File | null
  onFileChange: (file: File | null) => void
  onApply: (suggestion: ReceiptSuggestion) => void
  canAnalyze: boolean
  checkingAccess: boolean
  onBusyChange: (busy: boolean) => void
  onAnalysisStart: () => void
}) {
  const analyzer = useMemo(() => createReceiptAnalysis(tenantId), [tenantId])
  const queryClient = useQueryClient()
  const analyzing = useRef(false)
  const [suggestion, setSuggestion] = useState<ReceiptSuggestion | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => analyzer.cancel(), [analyzer])

  async function analyze(selected: File) {
    if (analyzing.current) return
    analyzing.current = true
    onAnalysisStart()
    onBusyChange(true)
    setBusy(true)
    setError('')
    setSuggestion(null)
    const result = await analyzer.analyze(selected)
    void queryClient.invalidateQueries({ queryKey: ['ai-credits', tenantId] })
    if (result.status === 'obsolete') return
    analyzing.current = false
    setBusy(false)
    onBusyChange(false)
    if (result.status === 'error') {
      setError(result.message)
      return
    }
    setSuggestion(result.suggestion)
    onApply(result.suggestion)
  }

  const detected = suggestion && Object.values(suggestion).some((value) => value !== null)

  return (
    <section className="space-y-2" aria-label="Justificante y análisis con IA">
      <p className="text-muted-foreground text-xs">
        {canAnalyze
          ? 'Al adjuntar un justificante se enviará al proveedor de IA para completar el apunte y se consumirá una solicitud. Máximo 2 MB para el análisis.'
          : 'Puedes adjuntar el justificante y completar el apunte manualmente.'}
      </p>
      <UploadFileField
        label="Justificante (opcional)"
        rules={receiptUpload}
        file={file}
        disabled={checkingAccess}
        onChange={(selected) => {
          analyzer.cancel()
          analyzing.current = false
          setBusy(false)
          onBusyChange(false)
          setError('')
          setSuggestion(null)
          onFileChange(selected)
          if (selected && canAnalyze) void analyze(selected)
        }}
      />
      {checkingAccess ? (
        <p className="text-muted-foreground text-xs">Comprobando acceso a IA…</p>
      ) : null}
      {busy ? (
        <output className="text-muted-foreground block text-sm" aria-live="polite">
          Analizando el justificante y completando el apunte…
        </output>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {suggestion && !busy ? (
        <output className="text-muted-foreground block text-sm">
          {detected
            ? 'Análisis finalizado. Revisa todos los campos antes de guardar.'
            : 'No se han detectado datos fiables. Completa el apunte manualmente.'}
          {suggestion.date === null ? ' No se ha identificado la fecha.' : ''}
          {suggestion.vatRate === null && !suggestion.vatLines
            ? ' No se ha identificado un desglose fiable del IVA. Revísalo antes de guardar.'
            : ''}
        </output>
      ) : null}
      {file && canAnalyze && !busy ? (
        <Button type="button" variant="outline" size="sm" onPress={() => void analyze(file)}>
          <Sparkle aria-hidden="true" className="size-4" />{' '}
          {error || suggestion
            ? 'Analizar de nuevo (consume otra solicitud)'
            : 'Analizar con IA (consume una solicitud)'}
        </Button>
      ) : null}
    </section>
  )
}
