import { useChat } from '@ai-sdk/react'
import { useAISDKRuntime } from '@assistant-ui/ai-sdk'
import { AssistantRuntimeProvider, ComposerPrimitive } from '@assistant-ui/react'
import { Button } from '@doscientos/ui'
import { Sparkle, X } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'

import { can, useSession } from '@/features/auth'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { newId, useTenantData } from '@/shared/store/store'

import { useAiAccess, useAiCredits } from '../application/ai-access'
import { chatContextWindow } from '../application/chat-context-window'
import {
  clientProposalSchema,
  clientProposalProgressSchema,
  estimateDraftProposalSchema,
  searchRecordsSchema,
  type ClientProposal,
} from '../domain/chat-tools'
import { appendEstimateSuggestion, estimateSuggestionSchema } from '../domain/suggestions'
import type { ClientProgress, DraftTarget } from './chat-context'
import { EstimateSuggestionPreview } from './estimate-suggestion-preview'

export function AiChatPanel({
  open,
  onOpenChange,
  prompt,
  onPromptUsed,
  tenantId,
  userId,
  onCreateClient,
  onClientProgress,
  completedClientProposalId,
  target,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prompt: string
  onPromptUsed: () => void
  tenantId: string
  userId: string
  onCreateClient: (proposal: ClientProposal, proposalId: string) => void
  onClientProgress: (progress: ClientProgress) => void
  completedClientProposalId: string | null
  target: DraftTarget | null
}) {
  const access = useAiAccess(tenantId, userId)
  const credits = useAiCredits(tenantId, access.data ? userId : undefined)
  const queryClient = useQueryClient()
  const data = useTenantData()
  const session = useSession()
  const [applied, setApplied] = useState<Set<string>>(() => new Set())
  const [applyError, setApplyError] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)
  const latest = useRef(data)
  const targetRef = useRef(target)
  const completedProposals = useRef(new Set<string>())
  const clientProgress = useRef(
    new Map<string, { fingerprint: string; values: ClientProgress['values'] }>(),
  )
  useEffect(() => {
    latest.current = data
    targetRef.current = target
  }, [data, target])
  const navigate = useNavigate()
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai_chat',
        prepareSendMessagesRequest: async ({ messages }) => {
          const { data: session } = await createBrowserSupabaseClient().auth.getSession()
          if (!session.session) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.')
          const bounded = chatContextWindow(messages, completedProposals.current)
          const estimate = targetRef.current?.estimate
          const context = estimate
            ? {
                title: estimate.title.slice(0, 200),
                number: estimate.number.slice(0, 100),
                clientName:
                  latest.current.clients
                    .find((client) => client.id === estimate.clientId)
                    ?.name.slice(0, 200) ?? null,
                lines: estimate.lines.slice(0, 10).map((line) => ({
                  description: line.description.slice(0, 200),
                  quantity: line.quantity,
                  unit: line.unit,
                  unitPriceCents: line.unitPriceCents,
                })),
                moreLines: estimate.lines.length > 10,
              }
            : null
          return {
            body: {
              tenantId,
              messages: bounded,
              context,
            },
            headers: { Authorization: `Bearer ${session.session.access_token}` },
          }
        },
      }),
    [tenantId],
  )
  const chat = useChat({
    transport,
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-credits', tenantId, userId] })
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-credits', tenantId, userId] })
    },
    sendAutomaticallyWhen: ({ messages }) => {
      const parts = messages.at(-1)?.parts ?? []
      const sinceUser = [...messages].reverse().findIndex((message) => message.role === 'user')
      const searchCount = messages
        .slice(sinceUser < 0 ? 0 : messages.length - sinceUser)
        .flatMap((message) => message.parts)
        .filter((part) => part.type === 'tool-buscar').length
      return (
        searchCount <= 2 &&
        parts.some((part) => part.type === 'tool-buscar') &&
        !parts.some(
          (part) =>
            part.type === 'tool-proponer_cliente' ||
            part.type === 'tool-proponer_partidas' ||
            part.type === 'tool-proponer_presupuesto',
        ) &&
        lastAssistantMessageIsCompleteWithToolCalls({ messages })
      )
    },
    onToolCall: ({ toolCall }) => {
      if (
        toolCall.toolName === 'proponer_cliente' ||
        toolCall.toolName === 'proponer_partidas' ||
        toolCall.toolName === 'proponer_presupuesto'
      ) {
        void chat.addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: { estado: 'Propuesta pendiente de revisión; no se ha guardado ni aplicado.' },
        })
        return
      }
      if (toolCall.toolName !== 'buscar') return
      const parsed = searchRecordsSchema.safeParse(toolCall.input)
      if (!parsed.success) {
        void chat.addToolOutput({
          tool: 'buscar',
          toolCallId: toolCall.toolCallId,
          output: { type: 'clientes', matches: [], error: 'Búsqueda no válida' },
        })
        return
      }
      const { type, query } = parsed.data
      if (!can(session?.role, type === 'clientes' ? 'clients:read' : 'estimates:read')) {
        void chat.addToolOutput({
          tool: 'buscar',
          toolCallId: toolCall.toolCallId,
          output: { type, matches: [], error: 'Sin permiso' },
        })
        return
      }
      const term = query.toLocaleLowerCase('es')
      const matches =
        type === 'clientes'
          ? latest.current.clients
              .filter(
                (client) =>
                  !client.archivedAt && client.name.toLocaleLowerCase('es').includes(term),
              )
              .slice(0, 10)
              .map(({ id, name }) => ({ id, name }))
          : latest.current.estimates
              .filter((estimate) =>
                `${estimate.number} ${estimate.title}`.toLocaleLowerCase('es').includes(term),
              )
              .slice(0, 10)
              .map(({ id, title, number, status }) => ({
                id,
                name: `${number} · ${title}`,
                status,
              }))
      void chat.addToolOutput({
        tool: 'buscar',
        toolCallId: toolCall.toolCallId,
        output: { type, matches },
      })
    },
  })
  const runtime = useAISDKRuntime(chat)
  const stop = chat.stop
  const busy = chat.status === 'streaming' || chat.status === 'submitted'
  useEffect(() => {
    if (completedClientProposalId) completedProposals.current.add(completedClientProposalId)
  }, [completedClientProposalId])
  useEffect(
    () => () => {
      void stop()
    },
    [stop],
  )
  useEffect(() => {
    const element = messagesRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [chat.messages])
  useEffect(() => {
    if (!prompt) return
    runtime.thread.composer.setText(prompt)
    onPromptUsed()
  }, [prompt, runtime, onPromptUsed])
  useEffect(() => {
    if (!access.data || !can(session?.role, 'clients:write')) return
    const message = chat.messages.at(-1)
    if (message?.role !== 'assistant') return
    for (const part of message.parts) {
      if (part.type !== 'tool-proponer_cliente') continue
      const previous = clientProgress.current.get(part.toolCallId)
      if (!open && !previous) continue
      const parsed = clientProposalProgressSchema.safeParse(part.input)
      const values = parsed.success ? parsed.data : previous?.values
      if (!values) continue
      const streaming = busy && part.state === 'input-streaming'
      const fingerprint = JSON.stringify({ values, streaming })
      if (previous?.fingerprint === fingerprint) continue
      clientProgress.current.set(part.toolCallId, { fingerprint, values })
      onClientProgress({
        id: part.toolCallId,
        values,
        streaming,
        stop: () => {
          void stop()
        },
      })
    }
  }, [chat.messages, busy, onClientProgress, session?.role, stop, access.data, open])

  if (!access.data) return null
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {!open ? (
        <Button
          type="button"
          className="fixed right-4 bottom-20 z-40 shadow-lg md:bottom-6"
          onPress={() => onOpenChange(true)}
        >
          <Sparkle aria-hidden="true" className="size-4" /> Asistente
        </Button>
      ) : (
        <aside
          aria-label="Asistente de Ábaco"
          className="bg-background border-border fixed right-2 bottom-2 z-40 flex h-[min(42rem,85dvh)] w-[min(27rem,calc(100vw-1rem))] flex-col rounded-2xl border shadow-xl"
        >
          <header className="flex items-center justify-between gap-3 border-b p-4">
            <div>
              <h2 className="font-semibold">Asistente de Ábaco</h2>
              <p className="text-muted-foreground text-xs">
                Consulta y prepara cambios para revisar
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              aria-label="Cerrar asistente"
              onPress={() => onOpenChange(false)}
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </header>
          <div
            ref={messagesRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
            aria-live="polite"
          >
            {!chat.messages.length ? (
              <p className="text-muted-foreground text-sm">
                Pregúntame por tus clientes o presupuestos, o dime qué quieres preparar.
              </p>
            ) : null}
            {chat.messages.map((message) => (
              <div key={message.id} className="space-y-2">
                {message.parts.map((part, index) => {
                  if (part.type === 'text')
                    return (
                      <p
                        key={index}
                        className={`rounded-xl p-3 text-sm whitespace-pre-wrap ${message.role === 'user' ? 'bg-primary/10' : 'bg-muted'}`}
                      >
                        {part.text}
                      </p>
                    )
                  if (part.type === 'tool-buscar') {
                    if (part.state !== 'output-available')
                      return (
                        <p key={index} className="text-muted-foreground text-sm">
                          Buscando en Ábaco…
                        </p>
                      )
                    const result = part.output as {
                      type: 'clientes' | 'presupuestos'
                      matches: { id: string; name: string }[]
                      error?: string
                    }
                    return (
                      <div key={index} className="space-y-1 rounded-xl border p-3 text-sm">
                        <p>Resultados de búsqueda</p>
                        {result.matches.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="text-primary block text-left underline"
                            onClick={() =>
                              void navigate(
                                result.type === 'clientes'
                                  ? { to: '/clientes/$clientId', params: { clientId: item.id } }
                                  : {
                                      to: '/presupuestos/$estimateId',
                                      params: { estimateId: item.id },
                                    },
                              )
                            }
                          >
                            {item.name}
                          </button>
                        ))}
                        {result.error ? (
                          <p>{result.error}</p>
                        ) : !result.matches.length ? (
                          <p>No hay resultados.</p>
                        ) : null}
                      </div>
                    )
                  }
                  if (
                    (part.type === 'tool-proponer_cliente' ||
                      part.type === 'tool-proponer_partidas' ||
                      part.type === 'tool-proponer_presupuesto') &&
                    part.state === 'input-streaming'
                  ) {
                    return (
                      <output key={index} className="text-muted-foreground block text-sm">
                        {part.type === 'tool-proponer_cliente'
                          ? 'Preparando los datos del cliente…'
                          : 'Preparando las partidas…'}
                      </output>
                    )
                  }
                  if (
                    part.type === 'tool-proponer_cliente' &&
                    (part.state === 'input-available' || part.state === 'output-available')
                  ) {
                    const proposal = clientProposalSchema.safeParse(part.input)
                    return proposal.success ? (
                      <section key={index} className="space-y-2 rounded-xl border p-3 text-sm">
                        <strong>Nuevo cliente: {proposal.data.name}</strong>
                        <p>
                          {[
                            proposal.data.email,
                            proposal.data.phone,
                            proposal.data.taxId,
                            proposal.data.address,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        <Button
                          type="button"
                          isDisabled={!can(session?.role, 'clients:write')}
                          onPress={() => {
                            onOpenChange(false)
                            onCreateClient(proposal.data, part.toolCallId)
                          }}
                        >
                          Revisar formulario
                        </Button>
                      </section>
                    ) : null
                  }
                  if (
                    (part.type === 'tool-proponer_partidas' ||
                      part.type === 'tool-proponer_presupuesto') &&
                    (part.state === 'input-available' || part.state === 'output-available')
                  ) {
                    const draft =
                      part.type === 'tool-proponer_presupuesto'
                        ? estimateDraftProposalSchema.safeParse(part.input)
                        : null
                    const proposal =
                      part.type === 'tool-proponer_partidas'
                        ? estimateSuggestionSchema.safeParse(part.input)
                        : null
                    const suggestion = draft?.success
                      ? draft.data.suggestion
                      : proposal?.success
                        ? proposal.data
                        : null
                    const proposedClient = draft?.success
                      ? data.clients.find(
                          (client) => client.id === draft.data.clientId && !client.archivedAt,
                        )
                      : null
                    const proposedTitle = draft?.success ? (draft.data.title ?? '') : ''
                    const draftReady = part.type !== 'tool-proponer_presupuesto' || target?.isNew
                    return suggestion ? (
                      <div key={index}>
                        {draft?.success ? (
                          <p className="text-sm">
                            {proposedTitle || 'Presupuesto sin título'} ·{' '}
                            {proposedClient?.name ?? 'Cliente pendiente'}
                          </p>
                        ) : null}
                        {draft?.success && target?.isNew ? (
                          <p className="text-muted-foreground text-xs">
                            Puedes añadir las partidas al borrador abierto. Revisa su título y
                            cliente en el formulario.
                          </p>
                        ) : null}
                        {(!target ||
                          (part.type === 'tool-proponer_presupuesto' && !target.isNew)) &&
                        can(session?.role, 'estimates:write') ? (
                          <div className="flex flex-wrap gap-2">
                            {(
                              [
                                { format: 'table', purpose: 'work', label: 'Abrir como obra' },
                                {
                                  format: 'sections',
                                  purpose: 'contract',
                                  label: 'Abrir como servicio',
                                },
                              ] as const
                            ).map((choice) => (
                              <Button
                                key={choice.purpose}
                                type="button"
                                variant="outline"
                                onPress={() => {
                                  void navigate({
                                    to: '/presupuestos/nuevo',
                                    search: {
                                      clientId: proposedClient?.id ?? '',
                                      title: proposedTitle,
                                      format: choice.format,
                                      purpose: choice.purpose,
                                    },
                                  })
                                }}
                              >
                                {choice.label}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                        <EstimateSuggestionPreview
                          suggestion={suggestion}
                          disabled={!target || !draftReady || applied.has(part.toolCallId)}
                          onApply={() => {
                            if (!target || !draftReady || applied.has(part.toolCallId)) return
                            const { patch } = appendEstimateSuggestion(
                              target.estimate,
                              suggestion,
                              newId,
                            )
                            if (!patch.lines) {
                              setApplyError(
                                'No se pueden añadir las partidas. Revisa los bloques y límites del presupuesto.',
                              )
                              return
                            }
                            target.apply(patch)
                            completedProposals.current.add(part.toolCallId)
                            setApplied((previous) => new Set(previous).add(part.toolCallId))
                            setApplyError('')
                          }}
                        />
                        {applied.has(part.toolCallId) ? (
                          <p className="text-primary text-sm">
                            Partidas añadidas. Revisa el presupuesto.
                          </p>
                        ) : null}
                      </div>
                    ) : null
                  }
                  return null
                })}
              </div>
            ))}
            {chat.error ? (
              <p role="alert" className="text-destructive text-sm">
                No se pudo completar la solicitud. Comprueba tu acceso y créditos de IA.
              </p>
            ) : null}
            {applyError ? (
              <p role="alert" className="text-destructive text-sm">
                {applyError}
              </p>
            ) : null}
          </div>
          <div className="space-y-2 border-t p-3">
            {target ? (
              <p className="text-muted-foreground text-xs">
                Presupuesto abierto: {target.estimate.number} {target.estimate.title}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Para aplicar partidas, abre un presupuesto en borrador.
              </p>
            )}
            <ComposerPrimitive.Root className="space-y-2">
              <ComposerPrimitive.Input
                aria-label="Mensaje al asistente"
                placeholder="¿En qué te ayudo?"
                maxLength={4000}
                className="border-input bg-background w-full resize-none rounded-xl border p-3 text-sm"
              />
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onPress={() => {
                    chat.setMessages([])
                    setApplied(new Set())
                    clientProgress.current.clear()
                    completedProposals.current.clear()
                    setApplyError('')
                  }}
                  isDisabled={busy}
                >
                  Limpiar chat
                </Button>
                {busy ? (
                  <Button type="button" variant="outline" onPress={() => void chat.stop()}>
                    Detener
                  </Button>
                ) : (
                  <ComposerPrimitive.Send className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                    Enviar
                  </ComposerPrimitive.Send>
                )}
              </div>
            </ComposerPrimitive.Root>
            <p className="text-muted-foreground text-xs">
              Cada llamada al modelo consume una solicitud, incluso si falla después de reservarse.
              Continuar tras una búsqueda puede consumir otra.
            </p>
            {credits.data ? (
              <p className="text-muted-foreground text-xs">
                Solicitudes mensuales restantes:{' '}
                {Math.max(0, credits.data.monthly_limit - credits.data.monthly_used)} · Créditos
                extra: {credits.data.extra_remaining}
              </p>
            ) : null}
          </div>
        </aside>
      )}
    </AssistantRuntimeProvider>
  )
}
