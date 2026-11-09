import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listAllOfficeVisits } from './visit-actions'

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
