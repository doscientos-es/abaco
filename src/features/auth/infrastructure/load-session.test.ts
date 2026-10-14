import { beforeEach, describe, expect, it, vi } from 'vitest'

import { completeWelcome } from '../application/welcome-actions'
import { welcomePendingField } from '../domain/welcome'

import { loadSession } from './load-session'

const { getSession, updateUser, from, rpc, request } = vi.hoisted(() => ({
  getSession: vi.fn(), updateUser: vi.fn(), from: vi.fn(), rpc: vi.fn(),
  request: { select: vi.fn(), eq: vi.fn(), order: vi.fn() },
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ auth: { getSession, updateUser }, from, rpc }),
}))

const membership = { tenant_id: 'company-1', role: 'owner', tenants: { name: 'Demo company' } }

describe('welcome state in the session', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    from.mockReturnValue(request)
    request.select.mockReturnValue(request)
    request.eq.mockReturnValue(request)
  })

  it('preserves the pending welcome when the signup company is created', async () => {
    getSession.mockResolvedValue({ data: { session: { user: {
      id: 'owner-1', email: 'owner@example.test',
      user_metadata: { company_name: 'Demo company', [welcomePendingField]: true },
    } } } })
    request.order.mockResolvedValueOnce({ data: [], error: null })
    request.order.mockResolvedValueOnce({ data: [membership], error: null })
    rpc.mockResolvedValue({ data: 'company-1', error: null })
    updateUser.mockResolvedValue({ error: null })

    await expect(loadSession()).resolves.toMatchObject({
      role: 'owner', tenantId: 'company-1', needsWelcome: true,
    })
    expect(rpc).toHaveBeenCalledWith('create_company', { p_name: 'Demo company' })
    expect(updateUser).toHaveBeenCalledWith({ data: {
      company_name: null, active_company_id: 'company-1',
    } })
  })

  it('remembers a completed welcome on the next session load', async () => {
    const metadata: Record<string, unknown> = { [welcomePendingField]: true }
    getSession.mockImplementation(async () => ({ data: { session: { user: {
      id: 'owner-1', email: 'owner@example.test', user_metadata: metadata,
    } } } }))
    request.order.mockResolvedValue({ data: [membership], error: null })
    updateUser.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(metadata, data)
      return { error: null }
    })

    expect((await loadSession())?.needsWelcome).toBe(true)
    await expect(completeWelcome()).resolves.toEqual({ ok: true })
    expect((await loadSession())?.needsWelcome).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})