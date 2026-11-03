import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listWorkOrders, updateWorkOrderPlan, type WorkOrder } from './work-order-repository'

const { rpc, query, from } = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), range: vi.fn() }
  return { rpc: vi.fn(), query, from: vi.fn() }
})

vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ rpc, from }),
}))

beforeEach(() => {
  vi.resetAllMocks()
  from.mockReturnValue(query)
  for (const method of ['select', 'eq', 'is', 'order'] as const)
    query[method].mockReturnValue(query)
  query.range.mockResolvedValue({ data: [], count: 37, error: null })
  rpc.mockResolvedValue({ error: null })
})

describe('work filters at the database boundary', () => {
  it('applies tenant, team, status and pagination before reading an exact filtered count', async () => {
    const result = await listWorkOrders('tenant', 1, 20, { equipo: 'team', estado: 'scheduled' })
    expect(query.eq.mock.calls).toEqual([
      ['tenant_id', 'tenant'],
      ['work_team_id', 'team'],
      ['status', 'scheduled'],
    ])
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('work_team_id'), {
      count: 'exact',
    })
    expect(query.order.mock.calls).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(query.range).toHaveBeenCalledWith(20, 39)
    expect(result.count).toBe(37)
  })

  it('uses SQL null semantics for unassigned work, not a literal team id', async () => {
    await listWorkOrders('tenant', 0, 20, { equipo: 'unassigned' })
    expect(query.is).toHaveBeenCalledWith('work_team_id', null)
    expect(query.eq.mock.calls).toEqual([['tenant_id', 'tenant']])
  })

  it('does not hide a failed read as an empty result', async () => {
    query.range.mockResolvedValue({ error: { message: 'Offline' } })
    await expect(listWorkOrders('tenant', 0)).rejects.toThrow('Offline')
  })
})

describe('atomic work planning', () => {
  it('sends the team, responsible person, dates and expected version in one command', async () => {
    await updateWorkOrderPlan({
      tenantId: 'tenant',
      workOrder: { id: 'work', updated_at: 'version' } as WorkOrder,
      responsibleUserId: 'person',
      workTeamId: 'team',
      plannedStartAt: null,
      plannedEndAt: null,
      description: '  Bring tools  ',
      operationId: 'retry-key',
    })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('plan_work_order', {
      p_tenant_id: 'tenant',
      p_work_order_id: 'work',
      p_expected_updated_at: 'version',
      p_responsible_user_id: 'person',
      p_work_team_id: 'team',
      p_planned_start_at: null,
      p_planned_end_at: null,
      p_description: 'Bring tools',
      p_operation_id: 'retry-key',
    })
  })
})
