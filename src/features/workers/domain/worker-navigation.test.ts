import { describe, expect, it } from 'vitest'

import { validateWorkersSearch } from './worker-navigation'

describe('worker navigation', () => {
  it('retains the selected view and the team or person on refresh', () => {
    expect(validateWorkersSearch({ vista: 'equipos' })).toEqual({ vista: 'equipos' })
    expect(validateWorkersSearch({ vista: 'vacaciones', equipo: 'north' })).toEqual({
      vista: 'vacaciones',
      equipo: 'north',
    })
    expect(validateWorkersSearch({ vista: 'horarios', persona: 'ana' })).toEqual({
      vista: 'horarios',
      persona: 'ana',
    })
    expect(validateWorkersSearch({ vista: 'documentos', persona: 'ana' })).toEqual({
      vista: 'documentos',
      persona: 'ana',
    })
  })

  it('keeps only valid local calendar dates in the calendar view', () => {
    expect(
      validateWorkersSearch({ vista: 'calendario', fecha: '2028-02-29', equipo: 'north' }),
    ).toEqual({
      vista: 'calendario',
      fecha: '2028-02-29',
      equipo: 'north',
    })
    for (const fecha of ['2026-02-29', '2026-11-31', '2026-11-27T00:00:00Z', ['2026-11-27']]) {
      expect(validateWorkersSearch({ vista: 'calendario', fecha })).toEqual({ vista: 'calendario' })
    }
    expect(validateWorkersSearch({ vista: 'horarios', fecha: '2026-11-27' })).toEqual({
      vista: 'horarios',
    })
  })

  it('gives person context precedence and ignores unsupported views', () => {
    expect(validateWorkersSearch({ vista: 'unknown', equipo: 'north', persona: 'ana' })).toEqual({
      persona: 'ana',
    })
    expect(validateWorkersSearch({ equipo: [], persona: null })).toEqual({})
  })

  it('falls back to people for old organization links without losing their context', () => {
    expect(validateWorkersSearch({ vista: 'organigrama' })).toEqual({})
    expect(validateWorkersSearch({ vista: 'organigrama', equipo: 'north' })).toEqual({
      equipo: 'north',
    })
  })

  it('preserves stale or malformed string IDs so the page shows not-found, not company-wide data', () => {
    expect(validateWorkersSearch({ equipo: 'not-a-uuid' })).toEqual({ equipo: 'not-a-uuid' })
  })
})
