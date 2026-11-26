import { describe, expect, it } from 'vitest'

import { parseCalendarVisitLink } from './calendar-visit-link'

const link = {
  empresa: '10000000-0000-4000-8000-000000000001',
  visita: '20000000-0000-4000-8000-000000000001',
  fecha: '2028-02-29',
}

describe('calendar visit links', () => {
  it('accepts a complete valid link and discards unrelated parameters', () => {
    expect(parseCalendarVisitLink({ ...link, unknown: 'ignored' })).toEqual(link)
  })

  it('rejects incomplete links, malformed identities and impossible dates', () => {
    for (const search of [
      {},
      { ...link, empresa: 'other' },
      { ...link, visita: ['visit'] },
      { ...link, fecha: '2027-02-29' },
      { ...link, fecha: '2028-13-01' },
      { ...link, fecha: '2028-2-29' },
    ]) {
      expect(parseCalendarVisitLink(search)).toBeNull()
    }
  })
})
