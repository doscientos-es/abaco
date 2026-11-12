import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  saveStaffSchedule,
  staffFunctionsQuery,
  staffSchedulesQuery,
} from './staff-schedule-repository'

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('@/shared/lib/supabase/client', () => ({ createBrowserSupabaseClient: () => mocks }))

function builder(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(async (start: number) => {
      if (table === 'staff_functions')
        return {
          data:
            start === 0
              ? Array.from({ length: 500 }, (_, i) => ({ id: String(i), name: `Función ${i}` }))
              : [{ id: '500', name: 'Última' }],
          error: null,
        }
      if (table === 'staff_schedules')
        return {
          data: [
            {
              user_id: 'ana',
              slots: [{ weekday: 1, start: 540, end: 1020 }],
              updated_at: 'version',
            },
          ],
          error: null,
        }
      if (table === 'staff_function_assignments')
        return {
          data: [
            { user_id: 'ana', function_id: 'f1' },
            { user_id: 'ana', function_id: 'f2' },
          ],
          error: null,
        }
      return { data: null, error: { message: 'error' } }
    }),
  }
  return query
}

describe('staff schedule repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.from.mockImplementation(builder)
  })

  it('retrieves every page of functions', async () => {
    const client = new QueryClient()
    const functions = await client.fetchQuery(staffFunctionsQuery('company'))
    expect(functions).toHaveLength(501)
    expect(functions[500]?.name).toBe('Última')
  })

  it('combines assignments with the corresponding schedule', async () => {
    const client = new QueryClient()
    const schedules = await client.fetchQuery(staffSchedulesQuery('company'))
    expect(schedules).toEqual([
      {
        userId: 'ana',
        updatedAt: 'version',
        slots: [{ weekday: 1, start: 540, end: 1020 }],
        functionIds: ['f1', 'f2'],
      },
    ])
  })

  it('submits the original version and surfaces concurrent modification errors', async () => {
    mocks.rpc.mockResolvedValue({
      error: { message: 'El horario cambió; recarga antes de guardar' },
    })
    await expect(
      saveStaffSchedule('company', 'ana', 'original-version', [], ['f1']),
    ).rejects.toThrow('recarga')
    expect(mocks.rpc).toHaveBeenCalledWith('save_staff_schedule', {
      p_tenant_id: 'company',
      p_user_id: 'ana',
      p_expected_updated_at: 'original-version',
      p_slots: [],
      p_function_ids: ['f1'],
    })
  })
})
