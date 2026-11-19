import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { TRIAL_DAYS } from '@/features/billing/domain/plans'
import { brand } from '@/shared/lib/brand'

import { RegisterPage } from './register-page'

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

describe('RegisterPage positioning', () => {
  const render = () => renderToStaticMarkup(<RegisterPage />)

  it('focuses on installers and a real quotation rather than generic management', () => {
    const html = render()

    expect(html).toContain(brand.tagline)
    expect(html).toContain(brand.audience)
    expect(html).toContain(brand.promise)
    expect(html).toContain('Prueba Ábaco con tu próximo presupuesto')
    expect(html).toContain('Instalaciones García')
    expect(html).toContain('Aceptación o rechazo desde el enlace del cliente.')
    expect(html).toContain('Facturas y seguimiento de cobros pendientes.')
    expect(html).not.toContain('firma certificada')
    expect(html).not.toContain('cobro automático de anticipos')
  })

  it('keeps the current offer and clearly describes the card-free trial', () => {
    const html = render()

    expect(html).toContain('href="/precios"')
    expect(html).toContain('El módulo de trabajadores está incluido desde el plan Equipo.')
    expect(html).toContain('Sin tarjeta.')
    expect(html).toContain('conservas tus datos en modo lectura')
    expect(html).toContain(`Crear cuenta y probar ${TRIAL_DAYS} días`)
    expect(html).toContain('autoComplete="new-password"')
  })
})
