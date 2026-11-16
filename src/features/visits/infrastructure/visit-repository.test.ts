import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listMyVisits } from './visit-repository'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
}))

vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))

describe('assigned visit acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const query = { select: mocks.select, eq: mocks.eq, in: mocks.in }
    mocks.from.mockReturnValue(query)
    mocks.select.mockReturnValue(query)
    mocks.eq.mockReturnValue(query)
  })

  it('uses the captured acceptance setting for each authorized visit', async () => {
    mocks.rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'my_assigned_visits'
          ? { data: [{ id: 'required' }, { id: 'optional' }], error: null }
          : {
              data: [{ visit_id: 'required', contract_id: 'contract', contract_title: 'Limpieza' }],
              error: null,
            },
      ),
    )
    mocks.in.mockResolvedValue({
      data: [
        { id: 'optional', work_order_id: null, paper_snapshot: { requiresAcceptance: false } },
        { id: 'required', work_order_id: 'work', paper_snapshot: { requiresAcceptance: true } },
      ],
      error: null,
    })

    const visits = await listMyVisits('tenant', '2026-11-15', '2026-11-15')

    expect(mocks.eq).toHaveBeenCalledWith('tenant_id', 'tenant')
    expect(mocks.in).toHaveBeenCalledWith('id', ['required', 'optional'])
    expect(visits).toEqual([
      {
        id: 'required',
        work_order_id: 'work',
        requires_acceptance: true,
        contract_id: 'contract',
        contract_title: 'Limpieza',
      },
      { id: 'optional', work_order_id: null, requires_acceptance: false },
    ])
  })

  it('propagates errors loading the visit details instead of hiding them', async () => {
    mocks.rpc.mockImplementation((name: string) =>
      Promise.resolve({
        data: name === 'my_assigned_visits' ? [{ id: 'visit' }] : [],
        error: null,
      }),
    )
    mocks.in.mockResolvedValue({ data: null, error: { message: 'offline' } })
    await expect(listMyVisits('tenant', '2026-11-15', '2026-11-15')).rejects.toThrow('offline')
  })

  it('propagates errors loading contract labels', async () => {
    mocks.rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'my_assigned_visits'
          ? { data: [{ id: 'visit' }], error: null }
          : { data: null, error: { message: 'Sin etiquetas' } },
      ),
    )
    mocks.in.mockResolvedValue({ data: [], error: null })
    await expect(listMyVisits('tenant', '2026-11-15', '2026-11-15')).rejects.toThrow(
      'Sin etiquetas',
    )
  })
})
