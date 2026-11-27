import { useChat } from '@ai-sdk/react'
import { useAISDKRuntime } from '@assistant-ui/ai-sdk'
import { AssistantRuntimeProvider, ComposerPrimitive } from '@assistant-ui/react'
import { Button } from '@doscientos/ui'
import { ArrowUp, ArrowsClockwise, Sparkle, Stop, X } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { useEffect, useMemo, useRef, useState } from 'react'

import { can, useSession } from '@/features/auth'
import { useModuleEnabled } from '@/features/product-modules'
import { formatEuros } from '@/shared/domain/money'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'
import { newId, useTenantData } from '@/shared/store/store'

import { useAiAccess, useAiCredits } from '../application/ai-access'
import { chatContextWindow, pendingContextLimitMessage } from '../application/chat-context-window'
import { searchRecords } from '../application/search-records'
import {
  catalogCreateProposalSchema,
  catalogPriceProposalSchema,
  clientProposalSchema,
  clientProposalProgressSchema,
  clientEditProposalSchema,
  applyEstimateLineEdit,
  estimateDraftProposalSchema,
  estimateLineEditSchema,
  inventoryProposalSchema,
  searchRecordsSchema,
  type ClientProposal,
} from '../domain/chat-tools'
import { appendEstimateSuggestion, estimateSuggestionSchema } from '../domain/suggestions'
import { CatalogBatchProposal } from './catalog-batch-proposal'
import type { ClientProgress, DraftTarget } from './chat-context'
import {
  ChatActivity,
  ChatCredits,
  ChatMessage,
  ChatProposal,
  ChatWelcome,
} from './chat-presentation'
import { EstimateSuggestionPreview } from './estimate-suggestion-preview'
import { RecordProposal } from './record-proposal'

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
  const procurement = useModuleEnabled(tenantId, 'procurement')
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
                id: estimate.id,
                title: estimate.title.slice(0, 200),
                number: estimate.number.slice(0, 100),
                clientName:
                  latest.current.clients
                    .find((client) => client.id === estimate.clientId)
                    ?.name.slice(0, 200) ?? null,
                lines: estimate.lines.slice(0, 10).map((line) => ({
                  id: line.id,
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
        searchCount <= 4 &&
        parts.some((part) => part.type === 'tool-buscar') &&
        !parts.some(
          (part) =>
            part.type === 'tool-proponer_cliente' ||
            part.type === 'tool-proponer_edicion_cliente' ||
            part.type === 'tool-proponer_stock' ||
            part.type === 'tool-proponer_materiales' ||
            part.type === 'tool-proponer_precios_catalogo' ||
            part.type === 'tool-proponer_edicion_partida' ||
            part.type === 'tool-proponer_partidas' ||
            part.type === 'tool-proponer_presupuesto',
        ) &&
        lastAssistantMessageIsCompleteWithToolCalls({ messages })
      )
    },
    onToolCall: ({ toolCall }) => {
      if (
        toolCall.toolName === 'proponer_cliente' ||
        toolCall.toolName === 'proponer_edicion_cliente' ||
        toolCall.toolName === 'proponer_stock' ||
        toolCall.toolName === 'proponer_materiales' ||
        toolCall.toolName === 'proponer_precios_catalogo' ||
        toolCall.toolName === 'proponer_edicion_partida' ||
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
      const { type } = parsed.data
      const permission =
        type === 'clientes'
          ? 'clients:read'
          : type === 'presupuestos'
            ? 'estimates:read'
            : 'catalog:read'
      if (!can(session?.role, permission) || (type === 'inventario' && !procurement)) {
        void chat.addToolOutput({
          tool: 'buscar',
          toolCallId: toolCall.toolCallId,
          output: {
            type,
            matches: [],
            error:
              type === 'inventario' && !procurement
                ? 'Módulo de inventario no disponible'
                : 'Sin permiso',
          },
        })
        return
      }
      void searchRecords(createBrowserSupabaseClient(), tenantId, parsed.data)
        .then((output) =>
          chat.addToolOutput({ tool: 'buscar', toolCallId: toolCall.toolCallId, output }),
        )
        .catch(() =>
          chat.addToolOutput({
            tool: 'buscar',
            toolCallId: toolCall.toolCallId,
            output: { type, matches: [], error: 'No se pudieron consultar los datos actuales.' },
          }),
        )
    },
  })
  const runtime = useAISDKRuntime(chat)
  const stop = chat.stop
  const busy = chat.status === 'streaming' || chat.status === 'submitted'
  const currentTool = [...chat.messages]
    .reverse()
    .find((message) => message.role === 'assistant')
    ?.parts.find((part) => 'state' in part && part.state === 'input-streaming')
  const searching = chat.messages
    .at(-1)
    ?.parts.some((part) => part.type === 'tool-buscar' && part.state !== 'output-available')
  const activity = searching
    ? 'Buscando en Ábaco…'
    : currentTool?.type === 'tool-proponer_cliente'
      ? 'Preparando los datos del cliente…'
      : currentTool?.type === 'tool-proponer_materiales' ||
          currentTool?.type === 'tool-proponer_precios_catalogo'
        ? 'Preparando la propuesta del catálogo…'
        : currentTool?.type === 'tool-proponer_partidas' ||
            currentTool?.type === 'tool-proponer_presupuesto'
          ? 'Preparando las partidas…'
          : 'Preparando respuesta…'
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
          className="bg-background border-border fixed right-2 bottom-2 z-40 flex h-[min(46rem,calc(100dvh-1rem))] w-[min(30rem,calc(100vw-1rem))] flex-col rounded-2xl border shadow-xl"
        >
          <header className="border-border space-y-3 border-b px-4 pt-4 pb-3">
            <div className="flex items-center gap-3">
              <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
                <Sparkle aria-hidden="true" weight="fill" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">Asistente</h2>
                <p className="text-muted-foreground text-xs">
                  Tu espacio para consultar y preparar
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Limpiar chat"
                isDisabled={busy || !chat.messages.length}
                onPress={() => {
                  chat.setMessages([])
                  setApplied(new Set())
                  clientProgress.current.clear()
                  completedProposals.current.clear()
                  setApplyError('')
                }}
              >
                <ArrowsClockwise aria-hidden="true" className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cerrar asistente"
                onPress={() => onOpenChange(false)}
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <ChatCredits credits={credits.data} error={credits.isError} />
          </header>
          <div
            ref={messagesRef}
            className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-5"
            aria-live="polite"
          >
            {!chat.messages.length ? (
              <ChatWelcome
                onSuggest={(value) => runtime.thread.composer.setText(value)}
                clients={can(session?.role, 'clients:read')}
                estimates={can(session?.role, 'estimates:read')}
                inventory={procurement && can(session?.role, 'catalog:read')}
              />
            ) : null}
            {chat.messages.map((message) => (
              <div key={message.id} className="min-w-0 space-y-3">
                {message.parts.map((part, index) => {
                  if (part.type === 'text')
                    return (
                      <ChatMessage key={index} text={part.text} user={message.role === 'user'} />
                    )
                  if (part.type === 'reasoning' && part.text)
                    return (
                      <details key={index} className="text-muted-foreground text-xs">
                        <summary className="cursor-pointer py-1">Ver razonamiento</summary>
                        <p className="mt-2 border-l pl-3 leading-relaxed whitespace-pre-wrap">
                          {part.text}
                        </p>
                      </details>
                    )
                  if (part.type === 'tool-buscar') {
                    if (part.state !== 'output-available') return null
                    const result = part.output as {
                      type: 'clientes' | 'presupuestos' | 'inventario'
                      matches: { id: string; name: string }[]
                      error?: string
                      truncated?: boolean
                    }
                    return (
                      <ChatProposal key={index} title="Resultados de búsqueda">
                        <div className="divide-border divide-y">
                          {result.matches.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="hover:bg-muted focus-visible:ring-ring flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left focus-visible:ring-2 focus-visible:outline-none"
                              onClick={() =>
                                void navigate(
                                  result.type === 'clientes'
                                    ? { to: '/clientes/$clientId', params: { clientId: item.id } }
                                    : result.type === 'presupuestos'
                                      ? {
                                          to: '/presupuestos/$estimateId',
                                          params: { estimateId: item.id },
                                        }
                                      : { to: '/catalogo', search: { q: item.name } },
                                )
                              }
                            >
                              {item.name}
                              <ArrowUp
                                aria-hidden="true"
                                className="text-muted-foreground size-4 rotate-45"
                              />
                            </button>
                          ))}
                        </div>
                        {result.error ? (
                          <p>{result.error}</p>
                        ) : !result.matches.length ? (
                          <p>No hay resultados.</p>
                        ) : null}
                        {result.truncated ? <p>Hay más resultados; concreta la búsqueda.</p> : null}
                      </ChatProposal>
                    )
                  }
                  if (
                    (part.type === 'tool-proponer_materiales' ||
                      part.type === 'tool-proponer_precios_catalogo') &&
                    part.state === 'input-streaming'
                  ) {
                    return null
                  }
                  if (
                    (part.type === 'tool-proponer_materiales' ||
                      part.type === 'tool-proponer_precios_catalogo') &&
                    (part.state === 'input-available' || part.state === 'output-available')
                  ) {
                    const creation =
                      part.type === 'tool-proponer_materiales'
                        ? catalogCreateProposalSchema.safeParse(part.input)
                        : null
                    const prices =
                      part.type === 'tool-proponer_precios_catalogo'
                        ? catalogPriceProposalSchema.safeParse(part.input)
                        : null
                    const proposal = creation?.success
                      ? { type: 'create' as const, value: creation.data }
                      : prices?.success
                        ? { type: 'prices' as const, value: prices.data }
                        : null
                    return proposal ? (
                      <CatalogBatchProposal
                        key={index}
                        proposal={proposal}
                        tenantId={tenantId}
                        enabled={!applied.has(part.toolCallId)}
                        onAttempt={() => {
                          completedProposals.current.add(part.toolCallId)
                          setApplied((previous) => new Set(previous).add(part.toolCallId))
                        }}
                      />
                    ) : null
                  }
                  if (
                    (part.type === 'tool-proponer_edicion_cliente' ||
                      part.type === 'tool-proponer_stock') &&
                    (part.state === 'input-available' || part.state === 'output-available')
                  ) {
                    const clientEdit =
                      part.type === 'tool-proponer_edicion_cliente'
                        ? clientEditProposalSchema.safeParse(part.input)
                        : null
                    const stockEdit =
                      part.type === 'tool-proponer_stock'
                        ? inventoryProposalSchema.safeParse(part.input)
                        : null
                    const proposal = clientEdit?.success
                      ? { type: 'cliente' as const, value: clientEdit.data }
                      : stockEdit?.success
                        ? { type: 'stock' as const, value: stockEdit.data }
                        : null
                    return proposal ? (
                      <RecordProposal
                        key={index}
                        proposal={proposal}
                        tenantId={tenantId}
                        enabled={
                          !applied.has(part.toolCallId) &&
                          (proposal.type !== 'stock' || procurement)
                        }
                        onSaved={() => {
                          completedProposals.current.add(part.toolCallId)
                          setApplied((previous) => new Set(previous).add(part.toolCallId))
                        }}
                      />
                    ) : null
                  }
                  if (
                    part.type === 'tool-proponer_edicion_partida' &&
                    (part.state === 'input-available' || part.state === 'output-available')
                  ) {
                    const parsed = estimateLineEditSchema.safeParse(part.input)
                    if (!parsed.success) return null
                    const proposal = parsed.data
                    const line =
                      target?.estimate.id === proposal.estimateId
                        ? target.estimate.lines.find((item) => item.id === proposal.lineId)
                        : undefined
                    const patch = target ? applyEstimateLineEdit(target.estimate, proposal) : null
                    return (
                      <ChatProposal key={index} title="Editar partida">
                        {line ? (
                          <div className="bg-muted/40 space-y-2 rounded-xl p-3 text-xs leading-relaxed">
                            <p className="text-muted-foreground">
                              Actual: {line.description} · {line.quantity} {line.unit} ·{' '}
                              {formatEuros(line.unitPriceCents)} / unidad
                            </p>
                            <p className="font-medium">
                              Propuesta: {proposal.description ?? line.description} ·{' '}
                              {proposal.quantity ?? line.quantity} {proposal.unit ?? line.unit} ·{' '}
                              {formatEuros(proposal.unitPriceCents ?? line.unitPriceCents)} / unidad
                            </p>
                          </div>
                        ) : (
                          <p>Abre el presupuesto en borrador para revisar esta partida.</p>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          isDisabled={
                            !patch ||
                            !target ||
                            !can(session?.role, 'estimates:write') ||
                            applied.has(part.toolCallId)
                          }
                          onPress={() => {
                            if (
                              !patch ||
                              !target ||
                              !can(session?.role, 'estimates:write') ||
                              applied.has(part.toolCallId)
                            )
                              return
                            target.apply(patch)
                            completedProposals.current.add(part.toolCallId)
                            setApplied((previous) => new Set(previous).add(part.toolCallId))
                          }}
                        >
                          Aplicar al borrador
                        </Button>
                        {applied.has(part.toolCallId) ? (
                          <p>Partida actualizada en el borrador. Revisa el presupuesto.</p>
                        ) : null}
                      </ChatProposal>
                    )
                  }
                  if (
                    (part.type === 'tool-proponer_cliente' ||
                      part.type === 'tool-proponer_partidas' ||
                      part.type === 'tool-proponer_presupuesto') &&
                    part.state === 'input-streaming'
                  ) {
                    return null
                  }
                  if (
                    part.type === 'tool-proponer_cliente' &&
                    (part.state === 'input-available' || part.state === 'output-available')
                  ) {
                    const proposal = clientProposalSchema.safeParse(part.input)
                    return proposal.success ? (
                      <ChatProposal key={index} title={`Nuevo cliente: ${proposal.data.name}`}>
                        <p className="text-muted-foreground break-words">
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
                      </ChatProposal>
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
                      <div key={index} className="space-y-3">
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
                          disabled={
                            !target ||
                            !draftReady ||
                            !can(session?.role, 'estimates:write') ||
                            applied.has(part.toolCallId)
                          }
                          onApply={() => {
                            if (
                              !target ||
                              !draftReady ||
                              !can(session?.role, 'estimates:write') ||
                              applied.has(part.toolCallId)
                            )
                              return
                            const { patch, incomplete } = appendEstimateSuggestion(
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
                            if (!incomplete) completedProposals.current.add(part.toolCallId)
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
            {busy ? <ChatActivity>{activity}</ChatActivity> : null}
            {chat.error ? (
              <p role="alert" className="text-destructive text-sm">
                {chat.error.message === pendingContextLimitMessage
                  ? chat.error.message
                  : 'No se pudo completar la solicitud. Comprueba tu acceso y créditos de IA.'}
              </p>
            ) : null}
            {applyError ? (
              <p role="alert" className="text-destructive text-sm">
                {applyError}
              </p>
            ) : null}
          </div>
          <div className="border-border space-y-2 border-t p-3">
            <ComposerPrimitive.Root className="border-input bg-background focus-within:ring-ring/30 rounded-2xl border p-2 shadow-sm focus-within:ring-2">
              <ComposerPrimitive.Input
                aria-label="Mensaje al asistente"
                placeholder="¿En qué te ayudo?"
                maxLength={4000}
                className="placeholder:text-muted-foreground max-h-32 min-h-12 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
              />
              <div className="flex items-center justify-between gap-2 pl-2">
                <span className="text-muted-foreground text-xs">Revisa siempre las propuestas</span>
                {busy ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onPress={() => void chat.stop()}
                  >
                    <Stop aria-hidden="true" weight="fill" /> Detener
                  </Button>
                ) : (
                  <ComposerPrimitive.Send
                    aria-label="Enviar mensaje"
                    className="bg-primary text-primary-foreground focus-visible:ring-ring flex size-9 items-center justify-center rounded-xl focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
                  >
                    <ArrowUp aria-hidden="true" className="size-4" />
                  </ComposerPrimitive.Send>
                )}
              </div>
            </ComposerPrimitive.Root>
          </div>
        </aside>
      )}
    </AssistantRuntimeProvider>
  )
}
