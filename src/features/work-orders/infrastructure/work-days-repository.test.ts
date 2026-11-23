import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listWorkDayVisits } from './work-days-repository'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  neq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
}))
vi.mock('@/shared/lib/supabase/client', () => ({
  createBrowserSupabaseClient: () => ({ from: mocks.from }),
}))

describe('listWorkDayVisits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const query = {
      select: mocks.select,
      eq: mocks.eq,
      neq: mocks.neq,
      order: mocks.order,
      range: mocks.range,
    }
    mocks.from.mockReturnValue(query)
    mocks.select.mockReturnValue(query)
    mocks.eq.mockReturnValue(query)
    mocks.neq.mockReturnValue(query)
    mocks.order.mockReturnValue(query)
  })

  it('loads all non-canceled visits for only the selected work and company', async () => {
    const rows = [{ id: 'visit', status: 'skipped' }]
    mocks.range.mockResolvedValue({ data: rows, error: null })
    expect(await listWorkDayVisits('tenant', 'work')).toEqual(rows)
    expect(mocks.from).toHaveBeenCalledWith('service_visits')
    expect(mocks.eq).toHaveBeenCalledWith('tenant_id', 'tenant')
    expect(mocks.eq).toHaveBeenCalledWith('work_order_id', 'work')
    expect(mocks.neq).toHaveBeenCalledWith('status', 'canceled')
    expect(mocks.range).toHaveBeenCalledWith(0, 499)
  })

  it('propagates a failed read rather than treating it as an empty calendar', async () => {
    mocks.range.mockResolvedValue({ data: null, error: { message: 'offline' } })
    await expect(listWorkDayVisits('tenant', 'work')).rejects.toThrow('offline')
  })
})
