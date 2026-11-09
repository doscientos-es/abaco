import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { SaveStatusNotice } from './save-status-notice'

vi.mock('@doscientos/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  buttonVariants: () => 'button',
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/ajustes?tab=plan">{children}</a>,
}))

describe('SaveStatusNotice', () => {
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
