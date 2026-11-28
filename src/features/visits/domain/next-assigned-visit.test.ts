import { describe, expect, it } from 'vitest'

import type { VisitSummary } from '../application/visit-actions'
import { localVisitDay, nextAssignedVisit } from './next-assigned-visit'

const visit = (
  id: string,
  start: string,
  end: string,
  status: VisitSummary['status'] = 'scheduled',
): VisitSummary => ({
  id,
  title: id,
  client_name: '',
  location_name: '',
  address: '',
  timezone: 'Europe/Madrid',
  scheduled_start_at: start,
  scheduled_end_at: end,
  status,
  priority: 'normal',
  notes: '',
  updated_at: start,
})

describe('worker next visit', () => {
  it('selects the earliest still actionable scheduled visit without changing the agenda order', () => {
    const now = Date.parse('2026-11-28T10:00:00Z')
    const stop = visit('stop', '2026-11-28T09:45:00Z', '2026-11-28T10:30:00Z')
    const later = visit('later', '2026-11-28T10:25:00Z', '2026-11-28T10:55:00Z')
    const scheduled = [
      later,
      visit('past', '2026-11-28T08:00:00Z', '2026-11-28T10:00:00Z'),
      visit('completed', '2026-11-28T09:00:00Z', '2026-11-28T10:30:00Z', 'completed'),
      visit('doing', '2026-11-28T09:00:00Z', '2026-11-28T10:30:00Z', 'in_progress'),
      visit('canceled', '2026-11-28T09:00:00Z', '2026-11-28T10:30:00Z', 'canceled'),
      visit('skipped', '2026-11-28T09:00:00Z', '2026-11-28T10:30:00Z', 'skipped'),
      stop,
    ]
    expect(nextAssignedVisit(scheduled, now)).toBe(stop)
    expect(scheduled[0]).toBe(later)
    expect(nextAssignedVisit(scheduled, Date.parse('2026-11-28T11:00:00Z'))).toBeUndefined()
  })

  it('opens the right local day for a job close to midnight UTC', () => {
    expect(localVisitDay(visit('night', '2026-12-31T23:40:00Z', '2027-01-01T00:30:00Z'))).toBe(
      '2027-01-01',
    )
  })
})
