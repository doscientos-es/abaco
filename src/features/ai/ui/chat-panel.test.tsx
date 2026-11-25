import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  messages: [] as unknown[],
  onToolCall: null as null | ((event: unknown) => void),
  output: vi.fn(),
  buttons: new Map<string, () => void>(),
  navigate: vi.fn(),
  preview: vi.fn(),
}))
vi.mock('@ai-sdk/react', () => ({
  useChat: (options: { onToolCall: (event: unknown) => void }) => {
    mocks.onToolCall = options.onToolCall
    return {
      messages: mocks.messages,
      status: 'ready',
      addToolOutput: mocks.output,
      setMessages: vi.fn(),
      stop: vi.fn(),
    }
  },
}))
vi.mock('@assistant-ui/ai-sdk', () => ({
  useAISDKRuntime: () => ({ thread: { composer: { setText: vi.fn() } } }),
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
  Button: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) => {
    if (typeof children === 'string' && onPress) mocks.buttons.set(children, onPress)
    return <button>{children}</button>
  },
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@/features/auth', () => ({
  useSession: () => ({ role: 'admin' }),
  can: (role: string) => role === 'admin',
}))
vi.mock('@/shared/store/store', () => ({
  newId: () => 'line-id',
  useTenantData: () => ({
    clients: [{ id: 'client-id', name: 'Marta', archivedAt: null }],
    estimates: [],
  }),
}))
vi.mock('../application/ai-access', () => ({ useAiAccess: () => ({ data: true }) }))
vi.mock('./estimate-suggestion-preview', () => ({
  EstimateSuggestionPreview: (props: { disabled: boolean }) => {
    mocks.preview(props)
    return <div>Vista previa</div>
  },
}))

import type { DraftTarget } from './chat-context'
import { AiChatPanel } from './chat-panel'

beforeEach(() => {
  mocks.messages = []
  mocks.buttons.clear()
  vi.clearAllMocks()
})

function render(onCreateClient = vi.fn(), target: DraftTarget | null = null) {
  const html = renderToStaticMarkup(
    <AiChatPanel
      open
      onOpenChange={vi.fn()}
      prompt=""
      onPromptUsed={vi.fn()}
      tenantId="tenant"
      userId="user"
      onCreateClient={onCreateClient}
      target={target}
    />,
  )
  return { html, onCreateClient }
}

it('returns matching real records to the model when it requests a search', () => {
  render()
  mocks.onToolCall?.({
    toolCall: {
      toolName: 'buscar',
      toolCallId: 'call1',
      input: { type: 'clientes', query: 'mart' },
    },
  })
  expect(mocks.output).toHaveBeenCalledWith({
    tool: 'buscar',
    toolCallId: 'call1',
    output: { type: 'clientes', matches: [{ id: 'client-id', name: 'Marta' }] },
  })
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
  expect(onCreateClient).toHaveBeenCalledWith(proposal)
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
