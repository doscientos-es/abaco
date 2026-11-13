import { describe, expect, it } from 'vitest'

import { validateWorkersSearch } from './worker-navigation'

describe('worker navigation', () => {
  it('retains the selected view and the team or person on refresh', () => {
    expect(validateWorkersSearch({ vista: 'vacaciones', equipo: 'north' })).toEqual({
      vista: 'vacaciones',
      equipo: 'north',
    })
    expect(validateWorkersSearch({ vista: 'horarios', persona: 'ana' })).toEqual({
      vista: 'horarios',
      persona: 'ana',
    })
  })

  it('gives person context precedence and ignores unsupported views', () => {
    expect(validateWorkersSearch({ vista: 'unknown', equipo: 'north', persona: 'ana' })).toEqual({
      persona: 'ana',
    })
    expect(validateWorkersSearch({ equipo: [], persona: null })).toEqual({})
  })

  it('preserves stale or malformed string IDs so the page shows not-found, not company-wide data', () => {
    expect(validateWorkersSearch({ equipo: 'not-a-uuid' })).toEqual({ equipo: 'not-a-uuid' })
  })
})
