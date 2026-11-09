import { describe, expect, it } from 'vitest'

import { validateAgendaSearch } from './agenda-search'

describe('agenda search', () => {
  it('keeps valid view, date and list period for direct links', () => {
    expect(validateAgendaSearch({ view: 'calendar', date: '2026-06-08', period: 'week' })).toEqual({
      view: 'calendar',
      date: '2026-06-08',
      period: 'week',
    })
  })

  it('drops unknown views, invalid dates and periods', () => {
    expect(validateAgendaSearch({ view: 'grid', date: '2026-02-30', period: 'month' })).toEqual({})
  })
})
