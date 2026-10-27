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
  TRIAL_DAYS: 14,
  subscriptionQuery: (id: string) => ({ queryKey: ['subscription', id] }),
}))
vi.mock('@/features/auth', () => ({
  sessionQuery: { queryKey: ['auth', 'session'] },
  useSession: () => ({ tenantId: 'company-1', role: 'owner', needsWelcome: true }),
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
  let busy: 'trial' | 'plan' | null
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
    busy = null
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
        canWrite: true,
        trialDaysLeft: 14,
        trialEndsAt: new Date('2026-11-01T12:00:00Z'),
      },
    })
    complete.mockResolvedValue({ ok: true })
    fetchQuery.mockResolvedValue({ needsWelcome: false })
    navigate.mockResolvedValue(undefined)
  })

  it('clearly offers a card-free trial, its end date, and a pay-now alternative', () => {
    const html = render()

    expect(html).toContain('Empezar 14 días gratis')
    expect(html).toContain('Elegir un plan ahora')
    expect(html).toContain('Tu prueba termina el')
    expect(html).toContain('1 de noviembre de 2026')
    expect(html).toContain('Sin tarjeta ni cobros automáticos durante la prueba.')
    expect(html).toContain('tus datos se conservan en modo lectura')
    expect(complete).not.toHaveBeenCalled()
  })

  it('guides activation through a real quotation and explains feature parity', () => {
    const html = render()

    expect(html).toContain('Tu primer presupuesto, paso a paso')
    expect(html).toContain('Añade un cliente.')
    expect(html).toContain('Prepara las partidas de materiales y mano de obra.')
    expect(html).toContain('Envía el enlace por WhatsApp o correo y consulta la respuesta.')
    expect(html).toContain('Todas las funciones están incluidas.')
    expect(html).toContain('Elige según el número de personas de tu equipo')
    expect(complete).not.toHaveBeenCalled()
  })

  it('saves the trial choice, refreshes the session, and opens the dashboard', async () => {
    render()
    choose('Empezar 14 días gratis')

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/', replace: true }))
    expect(complete).toHaveBeenCalledOnce()
    expect(fetchQuery).toHaveBeenCalledWith({ queryKey: ['auth', 'session'], staleTime: 0 })
    expect(complete.mock.invocationCallOrder[0]).toBeLessThan(
      fetchQuery.mock.invocationCallOrder[0] ?? 0,
    )
    expect(fetchQuery.mock.invocationCallOrder[0]).toBeLessThan(
      navigate.mock.invocationCallOrder[0] ?? 0,
    )
    expect(busy).toBeNull()
  })

  it('opens plan selection rather than charging when pay-now is chosen', async () => {
    render()
    choose('Elegir un plan ahora')

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/ajustes',
        search: { tab: 'plan' },
        replace: true,
      }),
    )
    expect(complete).toHaveBeenCalledOnce()
    expect(busy).toBeNull()
  })

  it('disables both choices while saving and re-enables them on failure', async () => {
    let finish: (result: ActionResult) => void = () => { }
    complete.mockReturnValue(
      new Promise<ActionResult>((resolve) => {
        finish = resolve
      }),
    )
    render()
    choose('Empezar 14 días gratis')
    button.mockClear()
    render()
    expect(button.mock.calls.every(([props]) => props.isDisabled)).toBe(true)

    finish({ ok: false, message: 'No se pudo guardar tu elección.' })
    await vi.waitFor(() => expect(busy).toBeNull())
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
    choose('Elegir un plan ahora')

    await vi.waitFor(() => expect(busy).toBeNull())
    expect(error).toBe('No se pudo continuar. Inténtalo de nuevo.')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('uses the actual trial time remaining instead of restarting fourteen days', () => {
    query.mockReturnValue({
      data: {
        status: 'trialing',
        canWrite: true,
        trialDaysLeft: 7,
        trialEndsAt: new Date('2026-11-01T12:00:00Z'),
      },
    })

    expect(render()).toContain('Empezar 7 días gratis')
  })

  it('does not promise another free trial after the existing one has expired', () => {
    query.mockReturnValue({
      data: {
        status: 'trialing',
        canWrite: false,
        trialDaysLeft: 0,
        trialEndsAt: new Date('2026-10-01T12:00:00Z'),
      },
    })

    const html = render()
    expect(html).toContain('Continuar en modo lectura')
    expect(html).toContain('Tu prueba terminó el')
    expect(html).not.toContain('Empezar 14 días gratis')
  })
})