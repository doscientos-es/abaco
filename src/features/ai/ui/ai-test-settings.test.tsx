import type React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cursor: 0,
  states: [] as unknown[],
  press: undefined as (() => void) | undefined,
  request: vi.fn(),
}))

vi.mock('react', async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = mocks.cursor++
    if (!(index in mocks.states)) mocks.states[index] = initial
    return [
      mocks.states[index],
      (value: unknown) => {
        mocks.states[index] = value
      },
    ]
  },
}))
vi.mock('@doscientos/ui', () => {
  const Container = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
  return {
    Button: ({
      children,
      onPress,
      isDisabled,
    }: {
      children: React.ReactNode
      onPress: () => void
      isDisabled: boolean
    }) => {
      mocks.press = onPress
      return <button disabled={isDisabled}>{children}</button>
    },
    Card: Container,
    CardContent: Container,
    CardHeader: Container,
    CardTitle: Container,
  }
})
vi.mock('../application/ai-actions', () => ({ requestSuggestion: mocks.request }))

import { AiTestSettings } from './ai-test-settings'

function render() {
  mocks.cursor = 0
  return renderToStaticMarkup(<AiTestSettings tenantId="company-a" />)
}

beforeEach(() => {
  mocks.states = []
  mocks.press = undefined
  mocks.request.mockReset()
})

describe('AI test in settings', () => {
  it('uses the normal estimate endpoint and shows its result', async () => {
    mocks.request.mockResolvedValue({ message: 'Necesito las medidas.', lines: [] })
    expect(render()).toContain('consume')
    mocks.press?.()
    expect(mocks.request).toHaveBeenCalledWith('company-a', {
      task: 'estimate',
      messages: [{ role: 'user', text: '¿Qué datos necesitas para pintar una habitación?' }],
    })
    await vi.waitFor(() => expect(render()).toContain('Necesito las medidas.'))
    expect(render()).not.toContain('role="alert"')
  })

  it('reports authorization or provider errors and permits retrying', async () => {
    mocks.request.mockRejectedValue(new Error('La IA no está activa para tu usuario.'))
    render()
    mocks.press?.()
    await vi.waitFor(() => expect(render()).toContain('La IA no está activa para tu usuario.'))
    expect(render()).toContain('role="alert"')
    expect(render()).not.toContain('disabled=""')
  })
})
