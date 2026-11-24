import type * as React from 'react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { RegisterPage } from './register-page'

const fixtures = vi.hoisted(() => ({ step: 0 }))
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof React>()
  return {
    ...react,
    useState: (initial: unknown) =>
      initial === 0 ? [fixtures.step, vi.fn()] : react.useState(initial),
  }
})
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
  signUp: vi.fn(),
}))
vi.mock('@/shared/ui/field-icons', () => ({ fieldIcons: { mail: null } }))
vi.mock('@/shared/ui/form', () => ({
  TextField: ({ label, placeholder }: { label: string; placeholder?: string }) => (
    <label>
      {label}
      <input placeholder={placeholder} />
    </label>
  ),
  PasswordField: ({
    label,
    placeholder,
    autoComplete,
  }: {
    label: string
    placeholder?: string
    autoComplete?: string
  }) => (
    <label>
      {label}
      <input placeholder={placeholder} autoComplete={autoComplete} />
    </label>
  ),
}))

describe('RegisterPage', () => {
  const render = () => renderToStaticMarkup(<RegisterPage />)

  it('starts with a single question and shows progress', () => {
    fixtures.step = 0
    const html = render()
    expect(html).toContain('Paso 1 de 3')
    expect(html).toContain('Progreso del registro')
    expect(html).toContain('Tu nombre')
    expect(html).not.toContain('Nombre de la empresa')
    expect(html).not.toContain('Contraseña')
    expect(html).toContain('Continuar')
  })

  it('asks for the company without discarding the option to go back', () => {
    fixtures.step = 1
    const html = render()
    expect(html).toContain('Paso 2 de 3')
    expect(html).toContain('Nombre de la empresa')
    expect(html).toContain('Volver')
    expect(html).not.toContain('Contraseña')
  })

  it('finishes with credentials and explains that activation is required', () => {
    fixtures.step = 2
    const html = render()
    expect(html).toContain('Paso 3 de 3')
    expect(html).toContain('Correo')
    expect(html).toContain('Contraseña')
    expect(html).toContain('href="/precios"')
    expect(html).toContain('Activa tu suscripción para empezar a usar Ábaco')
    expect(html).toContain('Crear cuenta')
    expect(html).toContain('autoComplete="new-password"')
    expect(html).toContain('Continuar con Google')
  })
})
