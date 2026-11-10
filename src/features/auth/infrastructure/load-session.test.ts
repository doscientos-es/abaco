import { beforeEach, describe, expect, it, vi } from 'vitest'

import { completeWelcome } from '../application/welcome-actions'
import { welcomePendingField } from '../domain/welcome'
import { setPreferredCompanyId } from './active-company'
import { loadSession } from './load-session'

const { getSession, updateUser, rpc } = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateUser: vi.fn(),
  rpc: vi.fn(),
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ auth: { getSession, updateUser }, rpc }),
}))

const membership = { tenant_id: 'company-1', role: 'admin', company_name: 'Demo company' }

describe('welcome state in the session', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('preserves the pending welcome when the signup company is created', async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'admin-1',
            email: 'admin@example.test',
            user_metadata: { company_name: 'Demo company', [welcomePendingField]: true },
          },
        },
      },
    })
    rpc.mockImplementation(async (name: string) => {
      if (name === 'create_company') return { data: 'company-1', error: null }
      if (name === 'my_company_memberships') {
        return { data: updateUser.mock.calls.length ? [membership] : [], error: null }
      }
      throw new Error(`Unexpected RPC: ${name}`)
    })
    updateUser.mockResolvedValue({ error: null })

    await expect(loadSession()).resolves.toMatchObject({
      role: 'admin',
      tenantId: 'company-1',
      needsWelcome: true,
    })
    expect(rpc).toHaveBeenCalledWith('create_company', { p_name: 'Demo company' })
    expect(updateUser).toHaveBeenCalledWith({
      data: {
        company_name: null,
        active_company_id: 'company-1',
      },
    })
  })

  it('remembers a completed welcome on the next session load', async () => {
    const metadata: Record<string, unknown> = { [welcomePendingField]: true }
    getSession.mockImplementation(async () => ({
      data: {
        session: {
          user: {
            id: 'admin-1',
            email: 'admin@example.test',
            user_metadata: metadata,
          },
        },
      },
    }))
    rpc.mockResolvedValue({ data: [membership], error: null })
    updateUser.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(metadata, data)
      return { error: null }
    })

    expect((await loadSession())?.needsWelcome).toBe(true)
    await expect(completeWelcome()).resolves.toEqual({ ok: true })
    expect((await loadSession())?.needsWelcome).toBe(false)
    expect(rpc).toHaveBeenCalledWith('my_company_memberships')
  })

  it('uses only accessible companies and updates the role when switching', async () => {
    const metadata: Record<string, unknown> = { active_company_id: 'company-1' }
    getSession.mockImplementation(async () => ({
      data: { session: { user: { id: 'user-1', user_metadata: metadata } } },
    }))
    rpc.mockResolvedValue({
      data: [
        { tenant_id: 'company-1', role: 'user', company_name: 'Uno' },
        { tenant_id: 'company-2', role: 'admin', company_name: 'Dos' },
      ],
      error: null,
    })
    updateUser.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      Object.assign(metadata, data)
      return { error: null }
    })

    expect(await loadSession()).toMatchObject({ tenantId: 'company-1', role: 'user' })
    await setPreferredCompanyId('company-2')
    expect(await loadSession()).toMatchObject({ tenantId: 'company-2', role: 'admin' })
    metadata.active_company_id = 'not-a-member'
    expect(await loadSession()).toMatchObject({ tenantId: 'company-1', role: 'user' })
  })

  it('reports a failure to save the selected company', async () => {
    updateUser.mockResolvedValue({ error: { message: 'Unavailable' } })
    await expect(setPreferredCompanyId('company-2')).rejects.toThrow(
      'No se pudo cambiar de empresa',
    )
  })
})
