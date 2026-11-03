import { describe, expect, it } from 'vitest'

import { parseWorkSearch } from './work-search'

describe('shareable work filters', () => {
  it('retains a valid team, status and page from a copied URL', () => {
    const equipo = '63000000-0000-4000-8000-000000000001'
    expect(parseWorkSearch({ equipo, estado: 'in_progress', pagina: '2' })).toEqual({
      equipo,
      estado: 'in_progress',
      pagina: 2,
    })
  })

  it('supports finding work without a team', () => {
    expect(parseWorkSearch({ equipo: 'unassigned' }).equipo).toBe('unassigned')
  })

  it.each([-1, 1.5, 'no-page', 100001, Infinity])(
    'discards an invalid page %s while preserving filters',
    (pagina) => {
      expect(parseWorkSearch({ equipo: 'unassigned', pagina })).toEqual({
        equipo: 'unassigned',
        pagina: undefined,
      })
    },
  )

  it('discards invalid filters and unrelated URL input', () => {
    expect(parseWorkSearch({ equipo: 'not-a-team', estado: 'deleted', other: 'ignored' })).toEqual({
      equipo: undefined,
      estado: undefined,
    })
  })
})
