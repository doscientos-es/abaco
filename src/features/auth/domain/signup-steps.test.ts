import { describe, expect, it } from 'vitest'

import { signupStepError } from './credentials'

describe('signup step validation', () => {
  const empty = { fullName: '', companyName: '', email: '', password: '' }

  it('validates each visible step without requiring future answers', () => {
    expect(signupStepError(0, empty)).toBe('Escribe tu nombre.')
    expect(signupStepError(0, { ...empty, fullName: 'Ana' })).toBeNull()
    expect(signupStepError(1, empty)).toBe('Escribe el nombre de tu empresa.')
    expect(signupStepError(1, { ...empty, companyName: 'Acme' })).toBeNull()
  })

  it('validates both account credentials before creating the account', () => {
    expect(signupStepError(2, empty)).toBe('Escribe tu correo.')
    expect(signupStepError(2, { ...empty, email: 'ana@example.test' })).toBe(
      'La contraseña necesita al menos 10 caracteres.',
    )
    expect(
      signupStepError(2, { ...empty, email: 'ana@example.test', password: 'Password123' }),
    ).toBeNull()
    expect(signupStepError(3, empty)).toBe('Revisa los datos.')
  })
})
