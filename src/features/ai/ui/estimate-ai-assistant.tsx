import {
  Button,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  Textarea,
} from '@doscientos/ui'
import { Sparkle } from '@phosphor-icons/react'
import { useState } from 'react'

import type { Estimate } from '@/shared/domain/types'
import { receiptUpload } from '@/shared/domain/upload-file'
import { newId } from '@/shared/store/store'
import { UploadFileField } from '@/shared/ui/upload-file-field'

import { aiDocument, requestSuggestion } from '../application/ai-actions'
import type { AiRequest } from '../domain/requests'
import { appendEstimateSuggestion, type EstimateSuggestion } from '../domain/suggestions'
import { EstimateSuggestionPreview } from './estimate-suggestion-preview'

type Message = Extract<AiRequest, { task: 'estimate' }>['messages'][number]
const uploadRules = { ...receiptUpload, maxMiB: 2 }

export function EstimateAiAssistant({
  tenantId,
  estimate,
  onPatch,
}: {
  tenantId: string
  estimate: Estimate
  onPatch: (patch: Partial<Estimate>) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [suggestion, setSuggestion] = useState<EstimateSuggestion | null>(null)
  const [applied, setApplied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send() {
    const prompt = text.trim()
    if (!prompt || busy) return
    const next: Message[] = [...messages, { role: 'user', text: prompt }]
    if (
      next.length > 20 ||
      next.some((message) => message.text.length > 4000) ||
      next.reduce((sum, message) => sum + message.text.length, 0) > 12000
    ) {
      setError(
        'La conversación ha alcanzado el límite. Inicia una nueva conversación para continuar.',
      )
      return
    }
    setBusy(true)
    setError('')
    try {
      const document = file ? await aiDocument(file) : undefined
      const result = await requestSuggestion(tenantId, {
        task: 'estimate',
        messages: next,
        ...(document ? { document } : {}),
      })
      setMessages([...next, { role: 'model', text: JSON.stringify(result) }])
      setText('')
      setSuggestion(result)
      setApplied(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo generar la propuesta.')
    } finally {
      setBusy(false)
    }
  }

  function apply() {
    if (!suggestion || applied) return
    const { patch } = appendEstimateSuggestion(estimate, suggestion, newId)
    if (!patch.lines) {
      setError('No se pueden añadir las partidas a este presupuesto. Revisa sus bloques y límites.')
      return
    }
    onPatch(patch)
    setApplied(true)
    setError('')
  }

  function reset() {
    setMessages([])
    setSuggestion(null)
    setText('')
    setFile(null)
    setApplied(false)
    setError('')
  }

  return (
    <>
      <Button type="button" variant="outline" onPress={() => setOpen(true)}>
        <Sparkle aria-hidden="true" className="size-4" /> Generar con IA
      </Button>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent overlaySlot="ai-chat-overlay" className="ai-chat">
          <DialogHeader>
            <DialogTitle>Crear con IA</DialogTitle>
            <DialogDescription>
              Cuéntanos qué necesitas presupuestar. Tú revisas y decides qué añadir.
            </DialogDescription>
          </DialogHeader>
          <div className="ai-chat-messages space-y-3" aria-live="polite" aria-busy={busy}>
            {messages.length === 0 ? (
              <div className="bg-primary/5 rounded-2xl p-4 text-sm">
                Describe el trabajo, las cantidades y los precios conocidos. Si falta algo, te
                preguntaré.
              </div>
            ) : null}
            {messages.map((message, index) =>
              message.role === 'user' ? (
                <p
                  key={index}
                  className="bg-muted ml-6 rounded-2xl p-3 text-sm break-words whitespace-pre-wrap"
                >
                  {message.text}
                </p>
              ) : index === messages.length - 1 && suggestion ? (
                <EstimateSuggestionPreview
                  key={index}
                  suggestion={suggestion}
                  onApply={apply}
                  disabled={applied || busy}
                />
              ) : (
                <p
                  key={index}
                  className="bg-primary/5 mr-6 rounded-2xl p-3 text-sm break-words whitespace-pre-wrap"
                >
                  {(JSON.parse(message.text) as EstimateSuggestion).message}
                </p>
              ),
            )}
            {applied ? (
              <output className="text-primary block text-sm">
                Partidas añadidas al borrador. Revisa los datos antes de guardarlo.
              </output>
            ) : null}
            {busy ? (
              <output className="text-muted-foreground block text-sm">
                Analizando los datos y preparando tu propuesta…
              </output>
            ) : null}
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
          </div>
          <div className="space-y-3 border-t pt-3">
            <UploadFileField
              label="Documento de apoyo (opcional)"
              rules={uploadRules}
              file={file}
              disabled={busy}
              onChange={setFile}
            />
            <Textarea
              aria-label="Describe el trabajo"
              placeholder="Por ejemplo: instalar 4 puntos de luz…"
              value={text}
              maxLength={4000}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              {messages.length ? (
                <Button type="button" variant="outline" onPress={reset} isDisabled={busy}>
                  Nueva conversación
                </Button>
              ) : (
                <span className="text-muted-foreground text-xs">
                  No se guarda nada sin tu confirmación.
                </span>
              )}
              <Button type="button" onPress={() => void send()} isDisabled={busy || !text.trim()}>
                {busy ? 'Preparando…' : 'Enviar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogRoot>
    </>
  )
}
