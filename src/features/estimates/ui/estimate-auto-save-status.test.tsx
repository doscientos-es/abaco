import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  status: { state: 'saved' } as { state: 'saved' | 'saving' | 'error'; message?: string },
  retry: vi.fn(),
  press: undefined as (() => void) | undefined,
}))

vi.mock('@/shared/store/store', () => ({
  useSaveStatus: () => mocks.status,
  retryStoreSaves: mocks.retry,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/ajustes?tab=plan">{children}</a>,
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => {
    mocks.press = onPress
    return <button>{children}</button>
  },
  buttonVariants: () => '',
}))

import { EstimateAutoSaveStatus } from './estimate-auto-save-status'

describe('EstimateAutoSaveStatus', () => {
  beforeEach(() => {
    mocks.status = { state: 'saved' }
    mocks.press = undefined
    mocks.retry.mockClear()
  })

  it.each([
    ['saved', 'Sincronización al día.'],
    ['saving', 'Guardando cambios…'],
    ['error', 'Hay cambios sin guardar.'],
  ] as const)('shows the actual %s state accessibly', (state, message) => {
    mocks.status = { state }
    const html = renderToStaticMarkup(<EstimateAutoSaveStatus />)
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain(message)
    expect(html).toContain('al editar o salir del campo')
  })

  it('allows retrying a failed save', () => {
    mocks.status = { state: 'error', message: 'Error de red' }
    expect(renderToStaticMarkup(<EstimateAutoSaveStatus />)).toContain('Reintentar guardado')
    mocks.press?.()
    expect(mocks.retry).toHaveBeenCalledOnce()
  })

  it('directs the user to plans when the trial has ended', () => {
    mocks.status = { state: 'error', message: 'Tu prueba ha terminado' }
    const html = renderToStaticMarkup(<EstimateAutoSaveStatus />)
    expect(html).toContain('Tu prueba ha terminado')
    expect(html).toContain('Elegir plan')
    expect(html).not.toContain('Reintentar guardado')
  })
})
