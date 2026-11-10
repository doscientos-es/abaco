import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { SaveStatusIndicator, SaveStatusNotice } from './save-status-notice'

vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  buttonVariants: () => 'button',
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/ajustes?tab=plan">{children}</a>,
}))

describe('SaveStatusNotice', () => {
  it('no ocupa espacio en el contenido mientras guarda o está al día', () => {
    const saving = renderToStaticMarkup(
      <SaveStatusNotice status={{ state: 'saving' }} onRetry={vi.fn()} />,
    )
    const saved = renderToStaticMarkup(
      <SaveStatusNotice status={{ state: 'saved' }} onRetry={vi.fn()} />,
    )

    expect(saving).toBe('')
    expect(saved).toBe('')
  })

  it('presents an expired trial as a reassuring plan prompt instead of a database error', () => {
    const html = renderToStaticMarkup(
      <SaveStatusNotice
        status={{
          state: 'error',
          message: 'estimate_lines: Tu prueba ha terminado. Elige un plan para seguir editando.',
        }}
        onRetry={vi.fn()}
      />,
    )

    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Tus datos guardados siguen a salvo.')
    expect(html).toContain('Este último cambio no se ha guardado')
    expect(html).toContain('href="/ajustes?tab=plan"')
    expect(html).toContain('Elegir plan')
    expect(html).not.toContain('Reintentar guardado')
    expect(html).not.toContain('estimate_lines')
    expect(html).not.toContain('border-destructive')
  })

  it('keeps unrelated save failures as actionable alerts', () => {
    const html = renderToStaticMarkup(
      <SaveStatusNotice
        status={{ state: 'error', message: 'No hay conexión.' }}
        onRetry={vi.fn()}
      />,
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('Hay cambios sin guardar. No hay conexión.')
    expect(html).toContain('Reintentar guardado')
  })
})

describe('SaveStatusIndicator', () => {
  it.each([
    ['saved', 'Guardado'],
    ['saving', 'Guardando…'],
    ['error', 'Sin guardar'],
  ] as const)('muestra el estado %s de forma accesible y compacta', (state, label) => {
    const html = renderToStaticMarkup(<SaveStatusIndicator status={{ state }} />)
    expect(html).toContain(label)
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('h-7 shrink-0')
    expect(html).toContain('aria-hidden="true"')
  })
})
