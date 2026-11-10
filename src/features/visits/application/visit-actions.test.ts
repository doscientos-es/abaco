import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listAllOfficeVisits, listPlanningVisits } from './visit-actions'

const { listOfficeVisits } = vi.hoisted(() => ({ listOfficeVisits: vi.fn() }))

vi.mock('../infrastructure/visit-repository', () => ({
  listOfficeVisits,
}))

describe('listAllOfficeVisits', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads every page until the final partial page', async () => {
    listOfficeVisits
      .mockResolvedValueOnce(Array.from({ length: 50 }, (_, index) => ({ id: `visit-${index}` })))
      .mockResolvedValueOnce([{ id: 'visit-50' }])

    const visits = await listAllOfficeVisits('tenant-1', '2026-06-08', '2026-06-14', null)

    expect(visits).toHaveLength(51)
    expect(listOfficeVisits).toHaveBeenNthCalledWith(
      1,
      'tenant-1',
      '2026-06-08',
      '2026-06-14',
      null,
      0,
    )
    expect(listOfficeVisits).toHaveBeenNthCalledWith(
      2,
      'tenant-1',
      '2026-06-08',
      '2026-06-14',
      null,
      1,
    )
  })

  it('does not make another request when the first page is partial', async () => {
    listOfficeVisits.mockResolvedValueOnce([{ id: 'visit-1' }])

    await expect(
      listAllOfficeVisits('tenant-1', '2026-06-08', '2026-06-14', 'tech-1'),
    ).resolves.toEqual([{ id: 'visit-1' }])
    expect(listOfficeVisits).toHaveBeenCalledTimes(1)
  })
})

describe('listPlanningVisits', () => {
  beforeEach(() => vi.clearAllMocks())
  it('partitions the entire 42-day month grid without exceeding RPC date limits or losing page filters', async () => {
    listOfficeVisits.mockResolvedValue([])
    await expect(listPlanningVisits('tenant', '2026-10-26', '2026-12-06', 'ana')).resolves.toEqual(
      [],
    )
    expect(listOfficeVisits.mock.calls).toEqual([
      ['tenant', '2026-10-25', '2026-11-24', 'ana', 0],
      ['tenant', '2026-11-25', '2026-12-06', 'ana', 0],
    ])
  })
  it('includes overnight carry-over but excludes a visit ending exactly at the first midnight', async () => {
    const common = { timezone: 'Europe/Madrid', scheduled_start_at: '2026-11-12T22:00:00Z' }
    const overnight = { ...common, id: 'night', scheduled_end_at: '2026-11-13T01:00:00Z' }
    listOfficeVisits.mockResolvedValue([
      overnight,
      { ...common, id: 'ends-at-midnight', scheduled_end_at: '2026-11-12T23:00:00Z' },
      {
        ...common,
        id: 'previous-day',
        scheduled_start_at: '2026-11-12T08:00:00Z',
        scheduled_end_at: '2026-11-12T09:00:00Z',
      },
    ])
    await expect(listPlanningVisits('tenant', '2026-11-13', '2026-11-13', null)).resolves.toEqual([
      overnight,
    ])
    expect(listOfficeVisits).toHaveBeenCalledWith('tenant', '2026-11-12', '2026-11-13', null, 0)
  })
})
