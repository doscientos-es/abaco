import { describe, expect, it } from 'vitest'

import type { VisitSummary } from '../application/visit-actions'
import { groupVisitsByContractDay } from './visit-calendar-groups'

const base: VisitSummary = {
  id: 'one',
  title: 'Fregar',
  client_name: 'Cliente',
  location_name: '',
  address: '',
  timezone: 'Europe/Madrid',
  scheduled_start_at: '2026-11-13T08:00:00Z',
  scheduled_end_at: '2026-11-13T09:00:00Z',
  status: 'scheduled',
  priority: 'normal',
  notes: '',
  updated_at: 'v1',
  contract_id: 'contract',
  contract_title: 'Oficina',
}

describe('groupVisitsByContractDay', () => {
  it('groups the same contract by local day, but keeps unrelated and separate-day visits apart', () => {
    const groups = groupVisitsByContractDay([
      {
        ...base,
        id: 'two',
        title: 'Cristales',
        scheduled_start_at: '2026-11-13T10:00:00Z',
        scheduled_end_at: '2026-11-13T11:00:00Z',
      },
      base,
      {
        ...base,
        id: 'tomorrow',
        scheduled_start_at: '2026-11-13T23:30:00Z',
        scheduled_end_at: '2026-11-14T00:00:00Z',
      },
      { ...base, id: 'other', contract_id: 'other', contract_title: 'Otro contrato' },
      { ...base, id: 'standalone', contract_id: '', contract_title: '' },
    ])
    const grouped = groups.find((group) => group.visits.length === 2)
    expect(groups).toHaveLength(4)
    expect(grouped?.title).toBe('Oficina')
    expect(grouped?.visits.map((visit) => visit.id)).toEqual(['one', 'two'])
    expect(grouped?.start.getHours()).toBe(9)
    expect(grouped?.end.getHours()).toBe(12)
    expect(groups.find((group) => group.visits[0]?.id === 'tomorrow')?.id).toBe('tomorrow')
    expect(groups.find((group) => group.id === 'standalone')?.title).toBe('Fregar')
  })
})
