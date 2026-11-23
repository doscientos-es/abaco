import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActionResult } from '@/features/auth'

import { WelcomePage } from './welcome-page'

const { state, button, query, complete, fetchQuery, navigate, setBusy, setError } = vi.hoisted(
  () => ({
    state: vi.fn(),
    button: vi.fn(),
    query: vi.fn(),
    complete: vi.fn(),
    fetchQuery: vi.fn(),
    navigate: vi.fn(),
    setBusy: vi.fn(),
    setError: vi.fn(),
  }),
)
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: state,
}))
vi.mock('@doscientos/ui', () => ({ Button: button }))
vi.mock('@tanstack/react-query', () => ({
  useQuery: query,
  useQueryClient: () => ({ fetchQuery }),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/features/billing', () => ({
  subscriptionQuery: (id: string) => ({ queryKey: ['subscription', id] }),
}))
vi.mock('@/features/auth', () => ({
  sessionQuery: { queryKey: ['auth', 'session'] },
  useSession: () => ({ tenantId: 'company-1', role: 'admin', needsWelcome: true }),
  completeWelcome: complete,
  AuthLayout: ({
    title,
    description,
    children,
  }: {
    title: string
    description: string
    children: React.ReactNode
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
  FormError: ({ message }: { message: string | null }) =>
    message ? <p role="alert">{message}</p> : null,
}))

describe('WelcomePage', () => {
  let busy: boolean
  let error: string | null
  let stateCalls: number
  const render = () => {
    stateCalls = 0
    return renderToStaticMarkup(<WelcomePage />)
  }
  const choose = (label: string) => {
    const props = button.mock.calls.find(([props]) => props.children === label)?.[0]
    expect(props).toBeDefined()
    props.onPress()
  }

  beforeEach(() => {
    vi.resetAllMocks()
    busy = false
    error = null
    setBusy.mockImplementation((value: typeof busy) => {
      busy = value
    })
    setError.mockImplementation((value: string | null) => {
      error = value
    })
    state.mockImplementation(() => (stateCalls++ === 0 ? [busy, setBusy] : [error, setError]))
    button.mockImplementation(
      ({ children, isDisabled }: { children: React.ReactNode; isDisabled?: boolean }) => (
        <button disabled={isDisabled}>{children}</button>
      ),
    )
    query.mockReturnValue({
      data: {
        status: 'trialing',
        canWrite: false,
      },
    })
    complete.mockResolvedValue({ ok: true })
    fetchQuery.mockResolvedValue({ needsWelcome: false })
    navigate.mockResolvedValue(undefined)
  })

  it('requires a subscription instead of offering a free trial', () => {
    const html = render()

    expect(html).toContain('Elegir un plan')
    expect(html).toContain('paga con tarjeta para utilizar Ábaco')
    expect(html).not.toContain('prueba gratuita')
    expect(complete).not.toHaveBeenCalled()
  })

  it('guides activation through a real quotation and explains feature parity', () => {
    const html = render()

    expect(html).toContain('Tu primer presupuesto, paso a paso')
    expect(html).toContain('Añade un cliente.')
    expect(html).toContain('Prepara las partidas de materiales y mano de obra.')
    expect(html).toContain('Envía el enlace por WhatsApp o correo y consulta la respuesta.')
    expect(complete).not.toHaveBeenCalled()
  })

  it('saves the welcome choice and opens the company for courtesy tenants', async () => {
    query.mockReturnValue({ data: { isComplimentary: true, status: 'trialing' } })
    render()
    choose('Ir a mi empresa')

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/', replace: true }))
    expect(complete).toHaveBeenCalledOnce()
    expect(fetchQuery).toHaveBeenCalledWith({ queryKey: ['auth', 'session'], staleTime: 0 })
    expect(complete.mock.invocationCallOrder[0]).toBeLessThan(
      fetchQuery.mock.invocationCallOrder[0] ?? 0,
    )
    expect(fetchQuery.mock.invocationCallOrder[0]).toBeLessThan(
      navigate.mock.invocationCallOrder[0] ?? 0,
    )
    expect(busy).toBe(false)
  })

  it('opens plan selection rather than charging when pay-now is chosen', async () => {
    render()
    choose('Elegir un plan')

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/ajustes',
        search: { tab: 'plan' },
        replace: true,
      }),
    )
    expect(complete).toHaveBeenCalledOnce()
    expect(busy).toBe(false)
  })

  it('disables the button while saving and re-enables it on failure', async () => {
    let finish: (result: ActionResult) => void = () => {}
    complete.mockReturnValue(
      new Promise<ActionResult>((resolve) => {
        finish = resolve
      }),
    )
    render()
    choose('Elegir un plan')
    button.mockClear()
    render()
    expect(button.mock.calls.every(([props]) => props.isDisabled)).toBe(true)

    finish({ ok: false, message: 'No se pudo guardar tu elección.' })
    await vi.waitFor(() => expect(busy).toBe(false))
    expect(error).toBe('No se pudo guardar tu elección.')
    expect(fetchQuery).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    button.mockClear()
    expect(render()).toContain('No se pudo guardar tu elección.')
    expect(button.mock.calls.every(([props]) => !props.isDisabled)).toBe(true)
  })

  it('handles a failed session refresh without a permanently disabled button', async () => {
    fetchQuery.mockRejectedValue(new Error('Unavailable'))
    render()
    choose('Elegir un plan')

    await vi.waitFor(() => expect(busy).toBe(false))
    expect(error).toBe('No se pudo continuar. Inténtalo de nuevo.')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('fails closed when the subscription cannot be loaded', () => {
    query.mockReturnValue({ data: undefined, isError: true })
    expect(render()).toContain('No se pudo comprobar tu suscripción')
    expect(button.mock.calls[0]?.[0].isDisabled).toBe(true)
  })
})
