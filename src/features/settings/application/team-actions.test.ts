import { beforeEach, describe, expect, it, vi } from 'vitest'

import { inviteMember } from './team-actions'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ functions: { invoke } }),
}))

const input = {
  tenantId: 'tenant',
  email: 'ana@example.com',
  role: 'user' as const,
  fullName: 'Ana',
}

describe('inviteMember', () => {
  beforeEach(() => invoke.mockReset())

  it('sends the user role and reports a successful invitation', async () => {
    invoke.mockResolvedValue({ data: { status: 'invited' }, error: null })
    expect(await inviteMember(input)).toEqual({ ok: true, status: 'invited' })
    expect(invoke).toHaveBeenCalledWith('invite-member', { body: input })
  })

  it.each([
    [400, 'Revisa el correo y el rol de la persona.'],
    [401, 'Tu sesión ha caducado. Inicia sesión de nuevo.'],
    [403, 'No tienes permiso para invitar a esta persona.'],
  ])('explains HTTP %i', async (status, message) => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response(null, { status }) } })
    expect(await inviteMember(input)).toEqual({ ok: false, message })
  })

  it('explains the plan limit without exposing arbitrary server errors', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: { context: Response.json({ error: 'plan_limit' }, { status: 409 }) },
    })
    expect(await inviteMember(input)).toEqual({
      ok: false,
      message: 'Has alcanzado el límite de personas de tu plan.',
    })
    invoke.mockResolvedValueOnce({
      data: null,
      error: { context: Response.json({ error: 'internal details' }, { status: 409 }) },
    })
    expect(await inviteMember(input)).toEqual({
      ok: false,
      message: 'No se pudo invitar. Inténtalo de nuevo.',
    })
  })
})
