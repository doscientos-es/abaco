import { readFileSync } from 'node:fs'

import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { MobileNavigation } from './mobile-navigation'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    'aria-label': label,
  }: {
    children: ReactNode
    to: string
    'aria-label': string
  }) => (
    <a href={to} aria-label={label}>
      {children}
    </a>
  ),
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children, onPress, ...props }: { children: ReactNode; onPress: () => void }) => (
    <button {...props} onClick={onPress}>
      {children}
    </button>
  ),
}))

describe('mobile navigation', () => {
  it('keeps shortcuts and exposes search as a way to find all sections', () => {
    const html = renderToStaticMarkup(
      <MobileNavigation
        items={[{ to: '/trabajos', label: 'Planificación', mobileLabel: 'Trabajos', icon: null }]}
        searchOpen
        onOpenSearch={vi.fn()}
      />,
    )
    expect(html).toContain('aria-label="Planificación"')
    expect(html).toContain('Trabajos')
    expect(html).toContain('aria-label="Buscar y ver todas las secciones"')
    expect(html).toContain('aria-expanded="true"')
  })

  it('lets the workspace header scroll away and uses readable input sizes on small screens', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(/@media \(width < 48rem\)\s*\{[\s\S]*?font-size:\s*1rem;/)
    expect(css).toMatch(/\.workspace-topbar\s*\{\s*position:\s*static;/)
  })
})
