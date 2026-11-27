import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { teamCalendarAbsencesQuery } from './team-calendar-repository'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/shared/lib/supabase/client', () => ({ createBrowserSupabaseClient: () => ({ from }) }))

describe('team calendar absence query', () => {
  it('uses a tenant-bound inclusive period and does not request personal reasons or comments', async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      lte: vi.fn(() => query),
      or: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn(async () => ({
        data: [
          { requester_id: 'person', start_date: '2026-11-23', end_date: null, status: 'pending' },
        ],
        error: null,
      })),
    }
    from.mockReturnValue(query)
    const options = teamCalendarAbsencesQuery('company', 'viewer', '2026-11-23', '2026-11-29')
    expect(options.queryKey).toEqual([
      'vacation-requests',
      'company',
      'team-calendar',
      'viewer',
      '2026-11-23',
      '2026-11-29',
    ])
    await expect(new QueryClient().fetchQuery(options)).resolves.toEqual([
      { userId: 'person', startDate: '2026-11-23', endDate: null, status: 'pending' },
    ])
    expect(from).toHaveBeenCalledWith('absence_requests')
    expect(query.select).toHaveBeenCalledWith('requester_id,start_date,end_date,status')
    expect(query.eq).toHaveBeenCalledWith('tenant_id', 'company')
    expect(query.in).toHaveBeenCalledWith('status', ['approved', 'pending', 'needs_info'])
    expect(query.lte).toHaveBeenCalledWith('start_date', '2026-11-29')
    expect(query.or).toHaveBeenCalledWith('end_date.is.null,end_date.gte.2026-11-23')
  })
})
