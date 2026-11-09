import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { LoginPage } from './login-page'

vi.mock('@doscientos/ui', () => ({
  Button: ({ children, isDisabled }: { children: ReactNode; isDisabled?: boolean }) => (
    <button disabled={isDisabled}>{children}</button>
  ),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('../application/auth-actions', () => ({
  sessionQuery: { queryKey: ['auth', 'session'] },
  signIn: vi.fn(),
}))
vi.mock('@/shared/ui/field-icons', () => ({ fieldIcons: { mail: null } }))
vi.mock('@/shared/ui/form', () => ({
  TextField: ({ label, autoComplete }: { label: string; autoComplete?: string }) => (
    <label>
      {label}
      <input autoComplete={autoComplete} />
    </label>
  ),
  PasswordField: ({ label, autoComplete }: { label: string; autoComplete?: string }) => (
    <label>
      {label}
      <input autoComplete={autoComplete} />
    </label>
  ),
}))

describe('LoginPage', () => {
  it('explains first access and configures browser credential autofill', () => {
    const html = renderToStaticMarkup(<LoginPage />)

    expect(html).toContain('¿Primera vez?')
    expect(html).toContain('abre el enlace del correo para aceptar la invitación')
    expect(html).toContain('href="/registro"')
    expect(html).toContain('autoComplete="username"')
    expect(html).toContain('autoComplete="current-password"')
  })
})
