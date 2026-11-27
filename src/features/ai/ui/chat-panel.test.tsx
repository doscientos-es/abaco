import type { ReactNode } from 'react'
import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  messages: [] as unknown[],
  onToolCall: null as null | ((event: unknown) => void),
  output: vi.fn(),
  buttons: new Map<string, () => void>(),
  navigate: vi.fn(),
  preview: vi.fn(),
  invalidate: vi.fn(),
  stop: vi.fn(),
  setText: vi.fn(),
  credits: { monthly_limit: 500, monthly_used: 24, extra_remaining: 3 } as {
    monthly_limit: number
    monthly_used: number
    extra_remaining: number
  } | null,
  inventory: true,
  onFinish: null as null | (() => void),
  onError: null as null | (() => void),
  prepareRequest: null as
    | null
    | ((options: { messages: unknown[] }) => Promise<{ body: { messages: unknown[] } }>),
  effects: [] as Array<() => void>,
  status: 'ready' as 'ready' | 'streaming' | 'submitted',
}))
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useEffect: (effect: () => void) => {
    mocks.effects.push(effect)
  },
}))
vi.mock('@ai-sdk/react', () => ({
  useChat: (options: {
    transport: { prepareSendMessagesRequest: typeof mocks.prepareRequest }
    onToolCall: (event: unknown) => void
    onFinish: () => void
    onError: () => void
  }) => {
    mocks.onToolCall = options.onToolCall
    mocks.onFinish = options.onFinish
    mocks.onError = options.onError
    mocks.prepareRequest = options.transport.prepareSendMessagesRequest
    return {
      messages: mocks.messages,
      status: mocks.status,
      addToolOutput: mocks.output,
      setMessages: vi.fn(),
      stop: mocks.stop,
    }
  },
}))
vi.mock('@assistant-ui/ai-sdk', () => ({
  useAISDKRuntime: () => ({ thread: { composer: { setText: mocks.setText } } }),
}))
vi.mock('@assistant-ui/react', () => ({
  AssistantRuntimeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  ComposerPrimitive: {
    Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Input: () => <textarea />,
    Send: () => <button>Enviar</button>,
  },
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({
    children,
    onPress,
    'aria-label': label,
  }: {
    children: ReactNode
    onPress?: () => void
    'aria-label'?: string
  }) => {
    if (typeof children === 'string' && onPress) mocks.buttons.set(children, onPress)
    if (label && onPress) mocks.buttons.set(label, onPress)
    return <button>{children}</button>
  },
  Spinner: () => <span />,
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}))
vi.mock('@/features/auth', () => ({
  useSession: () => ({ role: 'admin' }),
  can: (role: string) => role === 'admin',
}))
vi.mock('@/features/product-modules', () => ({ useModuleEnabled: () => mocks.inventory }))
vi.mock('../application/search-records', () => ({
  searchRecords: async () => ({ type: 'clientes', matches: [{ id: 'client-id', name: 'Marta' }] }),
}))
vi.mock('@/shared/store/store', () => ({
  newId: () => 'line-id',
  useTenantData: () => ({
    clients: [{ id: 'client-id', name: 'Marta', archivedAt: null }],
    estimates: [],
  }),
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic' } } }) },
  }),
}))
vi.mock('../application/ai-access', () => ({
  useAiAccess: () => ({ data: true }),
  useAiCredits: () => ({ data: mocks.credits }),
}))
vi.mock('./estimate-suggestion-preview', () => ({
  EstimateSuggestionPreview: (props: { disabled: boolean }) => {
    mocks.preview(props)
    return <div>Vista previa</div>
  },
}))
vi.mock('./chat-attachments', () => ({ ChatAttachments: () => <div>Adjuntos</div> }))

import type { DraftTarget } from './chat-context'
import { AiChatPanel } from './chat-panel'

beforeEach(() => {
  mocks.messages = []
  mocks.effects = []
  mocks.status = 'ready'
  mocks.credits = { monthly_limit: 500, monthly_used: 24, extra_remaining: 3 }
  mocks.inventory = true
  mocks.prepareRequest = null
  mocks.buttons.clear()
  vi.clearAllMocks()
})

function render(
  onCreateClient = vi.fn(),
  target: DraftTarget | null = null,
  onClientProgress = vi.fn(),
  completedClientProposalId: string | null = null,
) {
  const html = renderToStaticMarkup(
    <AiChatPanel
      open
      onOpenChange={vi.fn()}
      prompt=""
      onPromptUsed={vi.fn()}
      tenantId="tenant"
      userId="user"
      onCreateClient={onCreateClient}
      onClientProgress={onClientProgress}
      completedClientProposalId={completedClientProposalId}
      target={target}
    />,
  )
  return { html, onCreateClient, onClientProgress }
}

it('returns matching records to the model when it requests a search', async () => {
  render()
  mocks.onToolCall?.({
    toolCall: {
      toolName: 'buscar',
      toolCallId: 'call1',
      input: { type: 'clientes', query: 'mart' },
    },
  })
  await vi.waitFor(() =>
    expect(mocks.output).toHaveBeenCalledWith({
      tool: 'buscar',
      toolCallId: 'call1',
      output: { type: 'clientes', matches: [{ id: 'client-id', name: 'Marta' }] },
    }),
  )
})

it('refreshes the credit balance after successful and failed model calls', () => {
  const { html } = render()
  expect(html).toContain('476')
  expect(html).toContain('+3 extra')
  mocks.onFinish?.()
  mocks.onError?.()
  expect(mocks.invalidate).toHaveBeenCalledTimes(2)
  expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['ai-credits', 'tenant', 'user'] })
})

it('offers starter prompts without sending them and reflects the remaining allowance', () => {
  const { html } = render()
  expect(html).toContain('¿En qué puedo ayudarte?')
  expect(html).toContain('Solicitudes disponibles')
  expect(html).toContain('value="476"')
  expect(html).toContain('max="500"')
  expect(html).toContain('Información sobre el asistente y las solicitudes')
  mocks.buttons.get('Buscar un cliente')?.()
  expect(mocks.setText).toHaveBeenCalledWith('Ayúdame a buscar un cliente')
  expect(mocks.output).not.toHaveBeenCalled()
})

it('does not offer inventory suggestions when the module is unavailable', () => {
  mocks.inventory = false
  const { html } = render()
  expect(html).not.toContain('Consultar inventario')
})

it('handles an exhausted or unavailable allowance without inventing a balance', () => {
  mocks.credits = { monthly_limit: 0, monthly_used: 0, extra_remaining: 3 }
  expect(render().html).toContain('0 / 0')
  mocks.credits = null
  expect(render().html).toContain('No se pudo consultar el saldo')
})

it('shows the real active tool while streaming and keeps stop available', () => {
  mocks.status = 'streaming'
  mocks.messages = [
    {
      id: 'a',
      role: 'assistant',
      parts: [
        { type: 'tool-proponer_cliente', state: 'input-streaming', toolCallId: 'c', input: {} },
      ],
    },
  ]
  const { html } = render()
  expect(html).toContain('Preparando los datos del cliente…')
  expect(html).toContain('Detener')
  expect(html).not.toContain('¿En qué puedo ayudarte?')
  mocks.buttons.get('Detener respuesta')?.()
  expect(mocks.stop).toHaveBeenCalledOnce()
})

it('shows when a real search is running', () => {
  mocks.status = 'streaming'
  mocks.messages = [
    {
      id: 'a',
      role: 'assistant',
      parts: [
        {
          type: 'tool-buscar',
          state: 'input-available',
          toolCallId: 'c',
          input: { type: 'clientes', query: 'Mar' },
        },
      ],
    },
  ]
  expect(render().html).toContain('Buscando en Menos Líos…')
})

it('renders assistant markdown and keeps returned reasoning behind a disclosure', () => {
  mocks.messages = [
    {
      id: 'a',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'Comprobando datos' },
        { type: 'text', text: 'Revisa **este dato**.' },
      ],
    },
  ]
  const { html } = render()
  expect(html).toContain('<details')
  expect(html).toContain('Ver razonamiento')
  expect(html).toContain('<strong>este dato</strong>')
})

it('sends a fresh context after the client proposal was saved', async () => {
  const messages = [
    { id: 'old', role: 'user', parts: [{ type: 'text', text: 'Crea un cliente' }] },
    {
      id: 'assistant',
      role: 'assistant',
      parts: [
        {
          type: 'tool-proponer_cliente',
          toolCallId: 'call',
          state: 'output-available',
          input: { name: 'Marta' },
          output: {},
        },
      ],
    },
    { id: 'new', role: 'user', parts: [{ type: 'text', text: 'Otra tarea' }] },
  ]
  mocks.messages = messages
  render(vi.fn(), null, vi.fn(), 'call')
  mocks.effects.forEach((effect) => effect())
  const request = await mocks.prepareRequest?.({ messages })
  expect(request?.body.messages).toEqual([messages[2]])
})

it.each([
  { incomplete: false, resets: true },
  { incomplete: true, resets: false },
])(
  'only resets an estimate proposal when all lines were applied: $incomplete',
  async ({ incomplete, resets }) => {
    const line = {
      description: 'Pintar',
      details: null,
      kind: 'labor',
      unit: 'h',
      quantity: 1,
      unitPriceCents: 1000,
    }
    const messages = [
      { id: 'old', role: 'user', parts: [{ type: 'text', text: 'Prepara partidas' }] },
      {
        id: 'assistant',
        role: 'assistant',
        parts: [
          {
            type: 'tool-proponer_partidas',
            toolCallId: 'estimate',
            state: 'output-available',
            input: {
              message: 'Propuesta',
              lines: incomplete ? [line, { ...line, unitPriceCents: null }] : [line],
            },
            output: {},
          },
        ],
      },
      { id: 'new', role: 'user', parts: [{ type: 'text', text: 'Otra tarea' }] },
    ]
    mocks.messages = messages
    const target = {
      estimate: { lines: [], documentFormat: 'table', title: '', number: '', clientId: '' },
      isNew: true,
      apply: vi.fn(),
    } as unknown as DraftTarget
    render(vi.fn(), target)
    const preview = mocks.preview.mock.calls.at(-1)?.[0] as { onApply: () => void }
    preview.onApply()
    expect(target.apply).toHaveBeenCalledOnce()
    const request = await mocks.prepareRequest?.({ messages })
    expect(request?.body.messages).toEqual(resets ? [messages[2]] : messages)
  },
)

it('opens and updates the client form from actual partial tool input without repeating updates', () => {
  mocks.status = 'streaming'
  const part = {
    type: 'tool-proponer_cliente',
    toolCallId: 'call',
    state: 'input-streaming',
    input: { name: 'Mar' },
  }
  mocks.messages = [{ id: 'a', role: 'assistant', parts: [part] }]
  const { onClientProgress } = render()
  mocks.effects.forEach((effect) => effect())
  expect(onClientProgress).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'call', values: { name: 'Mar' }, streaming: true }),
  )
  onClientProgress.mock.calls[0]?.[0].stop()
  expect(mocks.stop).toHaveBeenCalledOnce()
  part.input = { name: 'Marta' }
  mocks.effects.forEach((effect) => effect())
  expect(onClientProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ values: { name: 'Marta' }, streaming: true }),
  )
  mocks.effects.forEach((effect) => effect())
  expect(onClientProgress).toHaveBeenCalledTimes(2)
  part.state = 'output-available'
  mocks.effects.forEach((effect) => effect())
  expect(onClientProgress).toHaveBeenLastCalledWith(expect.objectContaining({ streaming: false }))
})

it('shows proposed client data and opens the real form only on confirmation', () => {
  const proposal = { name: 'Marta', email: null, phone: null, taxId: null, address: null }
  mocks.messages = [
    {
      id: 'a',
      role: 'assistant',
      parts: [
        {
          type: 'tool-proponer_cliente',
          toolCallId: 'call',
          state: 'output-available',
          input: proposal,
          output: {},
        },
      ],
    },
  ]
  const { html, onCreateClient } = render()
  expect(html).toContain('Nuevo cliente: Marta')
  expect(onCreateClient).not.toHaveBeenCalled()
  mocks.buttons.get('Revisar formulario')?.()
  expect(onCreateClient).toHaveBeenCalledWith(proposal, 'call')
})

it('only enables a new estimate proposal for an open new draft', () => {
  mocks.messages = [
    {
      id: 'a',
      role: 'assistant',
      parts: [
        {
          type: 'tool-proponer_presupuesto',
          toolCallId: 'call',
          state: 'output-available',
          input: {
            title: 'Reforma',
            clientId: null,
            suggestion: { message: 'Propuesta', lines: [] },
          },
          output: {},
        },
      ],
    },
  ]
  const target = {
    estimate: { id: 'existing', number: 'P-1', title: 'Anterior' },
    apply: vi.fn(),
    isNew: false,
  } as unknown as DraftTarget
  render(vi.fn(), target)
  expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ disabled: true }))
  expect(mocks.buttons.has('Abrir como obra')).toBe(true)
  mocks.buttons.clear()
  render(vi.fn(), { ...target, isNew: true })
  expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ disabled: false }))
  expect(mocks.buttons.has('Abrir como obra')).toBe(false)
})
