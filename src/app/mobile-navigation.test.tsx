import { readFileSync } from 'node:fs'

import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

import { MobileNavigation } from './mobile-navigation'

const mocks = vi.hoisted(() => ({
  press: undefined as (() => void) | undefined,
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
}))
vi.mock('@doscientos/ui', () => ({
  Button: ({
    children,
    onPress,
    'aria-expanded': expanded,
    'aria-haspopup': popup,
  }: {
    children: ReactNode
    onPress: () => void
    'aria-expanded': boolean
    'aria-haspopup': 'dialog'
  }) => {
    mocks.press = onPress
    return (
      <button aria-expanded={expanded} aria-haspopup={popup}>
        {children}
      </button>
    )
  },
}))

it('renders the search dialog trigger after the configured shortcuts', () => {
  const onOpenSearch = vi.fn()
  const html = renderToStaticMarkup(
    <MobileNavigation
      items={[
        { to: '/', label: 'Resumen', icon: null },
        { to: '/trabajos', label: 'Planificación', mobileLabel: 'Trabajos', icon: null },
      ]}
      onOpenSearch={onOpenSearch}
      searchOpen={true}
    />,
  )
  expect(html).toContain('href="/trabajos" aria-label="Planificación"')
  expect(html).toContain('Trabajos')
  expect(html).toContain('aria-expanded="true" aria-haspopup="dialog"')
  expect(html).toContain('>Buscar</span></button></nav>')
  expect(html.indexOf('>Trabajos</span>')).toBeLessThan(html.indexOf('>Buscar</span>'))
  mocks.press?.()
  expect(onOpenSearch).toHaveBeenCalledOnce()
})

it('shows the bar below the desktop breakpoint and reserves the safe area', () => {
  const css = readFileSync(new URL('./mobile-navigation.css', import.meta.url), 'utf8')
  expect(css).toContain('display: grid')
  expect(css).toContain('env(safe-area-inset-bottom)')
  expect(css).toContain('@media (min-width: 48rem)')
  expect(css).toContain('display: none')
})
