import type * as React from 'react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { GoogleCallbackPage } from './google-callback-page'

const state = vi.hoisted(() => ({ failed: false }))
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof React>()
  return { ...react, useState: () => [state.failed, vi.fn()] }
})
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('../application/auth-actions', () => ({ sessionQuery: { queryKey: ['auth', 'session'] } }))
vi.mock('../application/google-auth', () => ({ finishGoogleAuth: vi.fn() }))

describe('GoogleCallbackPage', () => {
  it('shows an accessible loading state', () => {
    state.failed = false
    const html = renderToStaticMarkup(<GoogleCallbackPage />)
    expect(html).toContain('role="status"')
    expect(html).toContain('Conectando con Google')
    expect(html).toContain('motion-safe:animate-spin')
  })

  it('offers a way back when access fails', () => {
    state.failed = true
    const html = renderToStaticMarkup(<GoogleCallbackPage />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('No se pudo completar el acceso')
    expect(html).toContain('href="/"')
    expect(html).not.toContain('motion-safe:animate-spin')
  })
})
