import { describe, expect, it } from 'vitest'

import { handoffLocationName, handoffRecordedDay, latestHandoffVisit } from './client-handoff'

const base = {
  title: 'Visita',
  location_id: 'centre',
  scheduled_start_at: '2026-11-01T12:00:00Z',
  actual_start_at: null,
  actual_end_at: null,
  performed_on: null,
}

describe('fecha real del último servicio', () => {
  it('compara el día peninsular de un cierre con la fecha real del parte', () => {
    const paper = { ...base, performed_on: '2026-11-08' }
    const app = { ...base, actual_end_at: '2026-11-07T23:45:00Z' }
    expect(latestHandoffVisit(paper, app, null)).toBe(app)
    expect(
      latestHandoffVisit({ ...paper, performed_on: '2026-11-09' }, app, null)?.performed_on,
    ).toBe('2026-11-09')
    expect(latestHandoffVisit(paper, null, base)).toBe(paper)
    expect(latestHandoffVisit(null, null, base)).toBe(base)
    expect(handoffRecordedDay('2026-11-08')).toMatch(/8 nov/)
  })

  it('distingue centros desconocidos de visitas sin centro asignado', () => {
    expect(handoffLocationName('centre', [{ id: 'centre', name: 'Centro autorizado' }])).toBe(
      'Centro autorizado',
    )
    expect(handoffLocationName('other', [])).toBe('Centro no disponible')
    expect(handoffLocationName(null, [])).toBe('Sin centro asignado')
  })
})
