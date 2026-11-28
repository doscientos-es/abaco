import { describe, expect, it } from 'vitest'

import type { VisitSummary } from '../application/visit-actions'
import { closedVisitHistoryRange, selectClosedVisitHistory } from './closed-visit-history'

function visit(
  id: string,
  scheduled_start_at: string,
  overrides: Partial<VisitSummary> = {},
): VisitSummary {
  return {
    id,
    scheduled_start_at,
    status: 'completed',
    title: 'Revisión climatización',
    client_name: 'Cliente Muñoz',
    location_name: 'Sede Ávila',
    address: 'No se busca por dirección',
    scheduled_end_at: scheduled_start_at,
    timezone: 'Europe/Madrid',
    priority: 'normal',
    notes: 'Conservar las notas privadas fuera de la búsqueda',
    updated_at: scheduled_start_at,
    ...overrides,
  }
}

describe('closed visit history', () => {
  it('uses adjacent non-overlapping 30-day windows across years', () => {
    expect(closedVisitHistoryRange('2027-01-03', 0)).toEqual({
      from: '2026-12-05',
      to: '2027-01-03',
    })
    expect(closedVisitHistoryRange('2027-01-03', 1)).toEqual({
      from: '2026-11-05',
      to: '2026-12-04',
    })
  })

  it('matches words without accents in visible labels and only returns completed visits', () => {
    const oldest = visit('old', '2026-11-01T09:00:00Z')
    const latest = visit('new', '2026-11-06T00:00:00Z')
    const scheduled = visit('scheduled', '2026-11-10T12:00:00Z', { status: 'scheduled' })
    expect(selectClosedVisitHistory([oldest, latest, scheduled], ' avila    MUNOZ ')).toEqual([
      latest,
      oldest,
    ])
    expect(selectClosedVisitHistory([oldest], 'notas privadas')).toEqual([])
    expect(selectClosedVisitHistory([oldest], 'dirección')).toEqual([])
  })
})
