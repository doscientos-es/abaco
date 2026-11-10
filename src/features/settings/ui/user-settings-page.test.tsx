import type * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserSettingsPage } from './user-settings-page'

const { state, button, switchTo, session } = vi.hoisted(() => ({
  state: vi.fn(),
  button: vi.fn(),
  switchTo: vi.fn(),
  session: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useState: state,
}))
vi.mock('@doscientos/ui', () => ({
  Button: button,
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/auth', () => ({
  useSession: session,
  useCompanyActions: () => ({ switchTo }),
}))

describe('worker settings', () => {
  let values: unknown[]
  let cursor: number
  const companies = [
    { id: 'one', name: 'Empresa Uno', role: 'user' },
    { id: 'two', name: 'Empresa Dos', role: 'admin' },
  ]

  function render() {
    cursor = 0
    button.mockClear()
    return renderToStaticMarkup(<UserSettingsPage />)
  }

  beforeEach(() => {
    vi.resetAllMocks()
    values = []
    cursor = 0
    state.mockImplementation((initial: unknown) => {
      const index = cursor++
      if (!(index in values)) values[index] = initial
      return [
        values[index],
        (value: unknown) => {
          values[index] = value
        },
      ]
    })
    button.mockImplementation(
      ({ children, isDisabled }: { children: React.ReactNode; isDisabled: boolean }) => (
        <button disabled={isDisabled}>{children}</button>
      ),
    )
    session.mockReturnValue({ tenantId: 'one', companies })
    switchTo.mockResolvedValue(undefined)
  })

  it('shows the current company and switches only to another accessible company', async () => {
    const html = render()
    expect(html).toContain('Empresa Uno')
    expect(html).toContain('Empresa actual')
    expect(html).toContain('Cambiar a Empresa Dos')
    expect(button).toHaveBeenCalledTimes(1)
    button.mock.calls[0]?.[0].onPress()
    await vi.waitFor(() => expect(switchTo).toHaveBeenCalledWith('two'))
  })

  it('explains when only one company is available', () => {
    session.mockReturnValue({ tenantId: 'one', companies: [companies[0]] })
    expect(render()).toContain('Solo tienes acceso a esta empresa.')
    expect(button).not.toHaveBeenCalled()
  })

  it('reports a failed change and allows another attempt', async () => {
    switchTo.mockRejectedValueOnce(new Error('Network'))
    render()
    button.mock.calls[0]?.[0].onPress()
    await vi.waitFor(() => expect(render()).toContain('No se pudo cambiar de empresa.'))
    expect(button.mock.calls[0]?.[0].isDisabled).toBe(false)
  })
})
