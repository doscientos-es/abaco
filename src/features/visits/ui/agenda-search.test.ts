import { describe, expect, it } from 'vitest'

import { validateAgendaSearch } from './agenda-search'

describe('agenda search', () => {
  it('validates shared filters and preserves spaces while typing multi-word queries', () => {
    const team = '63000000-0000-4000-8000-000000000001'
    expect(
      validateAgendaSearch({ team, technician: 'unassigned', status: 'completed', q: 'Oficina ' }),
    ).toEqual({
      team,
      technician: 'unassigned',
      status: 'completed',
      q: 'Oficina ',
    })
    expect(
      validateAgendaSearch({ team: 'bad-id', technician: {}, status: 'ready', q: [] }),
    ).toEqual({})
  })

  it('keeps valid view, date and list period for direct links', () => {
    expect(validateAgendaSearch({ view: 'calendar', date: '2026-06-08', period: 'week' })).toEqual({
      view: 'calendar',
      date: '2026-06-08',
      period: 'week',
    })
  })

  it('drops unknown views, invalid dates and periods', () => {
    expect(validateAgendaSearch({ view: 'grid', date: '2026-02-30', period: 'year' })).toEqual({})
  })

  it('preserves the monthly planning period in direct links', () => {
    expect(validateAgendaSearch({ view: 'calendar', date: '2026-11-13', period: 'month' })).toEqual(
      { view: 'calendar', date: '2026-11-13', period: 'month' },
    )
  })
})
