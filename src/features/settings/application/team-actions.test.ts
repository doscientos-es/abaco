import { beforeEach, describe, expect, it, vi } from 'vitest'

import { changeMemberRole, inviteMember, removeMember } from './team-actions'

const { invoke, from, update, remove, eq } = vi.hoisted(() => ({
  invoke: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  eq: vi.fn(),
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ functions: { invoke }, from }),
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

  it('does not report success when the invitation response is missing or invalid', async () => {
    for (const data of [null, {}, { status: 'unknown' }]) {
      invoke.mockResolvedValueOnce({ data, error: null })
      expect(await inviteMember(input)).toEqual({
        ok: false,
        message: 'No se pudo confirmar la invitación. Revisa el equipo antes de reintentar.',
      })
    }
  })
})

describe('team membership changes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    from.mockReturnValue({ update, delete: remove })
    update.mockReturnValue({ eq })
    remove.mockReturnValue({ eq })
    eq.mockReturnValueOnce({ eq })
  })

  it.each([
    ['role change', () => changeMemberRole('tenant', 'member', 'admin')],
    ['removal', () => removeMember('tenant', 'member')],
  ])('%s reports success only for one affected membership', async (_name, action) => {
    eq.mockResolvedValueOnce({ count: 1, error: null })
    expect(await action()).toEqual({ ok: true })
    expect(from).toHaveBeenCalledWith('memberships')
    expect(eq).toHaveBeenNthCalledWith(1, 'tenant_id', 'tenant')
    expect(eq).toHaveBeenNthCalledWith(2, 'user_id', 'member')
    expect(update.mock.calls[0] ?? remove.mock.calls[0]).toContainEqual({ count: 'exact' })
  })

  it.each([
    ['role change', () => changeMemberRole('tenant', 'member', 'admin')],
    ['removal', () => removeMember('tenant', 'member')],
  ])('%s reports failure when no membership was modified', async (_name, action) => {
    eq.mockResolvedValueOnce({ count: 0, error: null })
    expect(await action()).toMatchObject({ ok: false })
  })

  it('reports database errors instead of success', async () => {
    eq.mockResolvedValueOnce({ count: null, error: { message: 'denied' } })
    expect(await removeMember('tenant', 'member')).toMatchObject({ ok: false })
  })
})
