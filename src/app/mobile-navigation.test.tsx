import { readFileSync } from 'node:fs'

import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

import { MobileNavigation } from './mobile-navigation'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  action: undefined as (() => void) | undefined,
}))
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
  useNavigate: () => mocks.navigate,
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({ children, className }: { children: ReactNode; className: string }) => (
    <button className={className}>{children}</button>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onAction }: { children: ReactNode; onAction: () => void }) => {
    mocks.action = onAction
    return <button>{children}</button>
  },
}))

it('exposes direct links and navigates to remaining modules from Más', () => {
  const html = renderToStaticMarkup(
    <MobileNavigation
      items={[
        { to: '/', label: 'Resumen', icon: null },
        { to: '/trabajos', label: 'Planificación', mobileLabel: 'Trabajos', icon: null },
      ]}
      moreItems={[{ to: '/facturas', label: 'Facturas', icon: null }]}
      pathname="/facturas/123"
    />,
  )
  expect(html).toContain('href="/trabajos" aria-label="Planificación"')
  expect(html).toContain('Trabajos')
  expect(html).toContain('Facturas')
  expect(html).toContain('mobile-bottom-nav__link--active')
  mocks.action?.()
  expect(mocks.navigate).toHaveBeenCalledWith({ to: '/facturas' })
})

it('shows the bar below the desktop breakpoint and reserves the safe area', () => {
  const css = readFileSync(new URL('./mobile-navigation.css', import.meta.url), 'utf8')
  expect(css).toContain('display: grid')
  expect(css).toContain('env(safe-area-inset-bottom)')
  expect(css).toContain('@media (min-width: 48rem)')
  expect(css).toContain('display: none')
})
