import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Role } from '../domain/permissions'
import { needsWelcome, welcomePendingField } from '../domain/welcome'

import { signUp } from './auth-actions'
import { completeWelcome, welcomeRedirect } from './welcome-actions'

const { updateUser, signup, rpc } = vi.hoisted(() => ({
  updateUser: vi.fn(), signup: vi.fn(), rpc: vi.fn(),
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ auth: { updateUser, signUp: signup }, rpc }),
}))

describe('welcome eligibility and routing', () => {
  it('welcomes only new signup owners with an explicit pending marker', () => {
    expect(needsWelcome('owner', { [welcomePendingField]: true })).toBe(true)
    expect(needsWelcome('owner', {})).toBe(false)
    expect(needsWelcome('owner', { [welcomePendingField]: false })).toBe(false)
    expect(needsWelcome('owner', { [welcomePendingField]: 'true' })).toBe(false)
  })

  it.each<Role | null>(['admin', 'editor', 'viewer', null])('does not gate a %s account', (role) => {
    expect(needsWelcome(role, { [welcomePendingField]: true })).toBe(false)
  })

  it('routes a pending owner to welcome without a redirect loop', () => {
    expect(welcomeRedirect(true, '/')).toBe('/bienvenida')
    expect(welcomeRedirect(true, '/ajustes')).toBe('/bienvenida')
    expect(welcomeRedirect(true, '/bienvenida')).toBeNull()
  })

  it('leaves established accounts alone and redirects a completed welcome', () => {
    expect(welcomeRedirect(false, '/')).toBeNull()
    expect(welcomeRedirect(false, '/ajustes')).toBeNull()
    expect(welcomeRedirect(false, '/bienvenida')).toBe('/')
  })

  it('does not interrupt password recovery or invitation password setup', () => {
    expect(welcomeRedirect(true, '/nueva-contrasena')).toBeNull()
  })
})

describe('welcome persistence', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('marks a new signup for welcome even when email confirmation is required', async () => {
    signup.mockResolvedValue({ data: { session: null }, error: null })

    await expect(signUp({
      fullName: 'Demo owner', companyName: 'Demo company',
      email: 'owner@example.test', password: 'test-only-password',
    })).resolves.toEqual({ ok: true, needsConfirmation: true })
    expect(signup).toHaveBeenCalledWith(expect.objectContaining({
      options: { data: {
        full_name: 'Demo owner', company_name: 'Demo company', [welcomePendingField]: true,
      } },
    }))
  })

  it('completes welcome without starting checkout or changing trial dates', async () => {
    updateUser.mockResolvedValue({ error: null })

    await expect(completeWelcome()).resolves.toEqual({ ok: true })
    expect(updateUser).toHaveBeenCalledWith({ data: { [welcomePendingField]: false } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reports a save failure so the owner can retry', async () => {
    updateUser.mockResolvedValue({ error: { message: 'Unavailable' } })

    await expect(completeWelcome()).resolves.toEqual({
      ok: false, message: 'No se pudo guardar tu elección. Inténtalo de nuevo.',
    })
  })

  it('handles a rejected save without an unhandled error', async () => {
    updateUser.mockRejectedValue(new Error('Unavailable'))

    await expect(completeWelcome()).resolves.toMatchObject({ ok: false })
  })
})