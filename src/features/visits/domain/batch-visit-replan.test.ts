import { describe, expect, it } from 'vitest'

import type { VisitSummary } from '../application/visit-actions'
import { batchAgendaRange, evaluateVisitBatch, proposeVisitShift } from './batch-visit-replan'

function visit(
  id: string,
  start: string,
  end: string,
  extra: Partial<VisitSummary> = {},
): VisitSummary {
  return {
    id,
    title: id,
    client_name: '',
    location_name: '',
    address: '',
    timezone: 'Europe/Madrid',
    assigned_user_id: 'member-a',
    work_team_id: null,
    scheduled_start_at: start,
    scheduled_end_at: end,
    updated_at: 'revision',
    status: 'scheduled',
    priority: 'normal',
    notes: '',
    ...extra,
  }
}

const a = visit('A', '2026-11-27T08:00:00Z', '2026-11-27T09:00:00Z')
const b = visit('B', '2026-11-27T09:00:00Z', '2026-11-27T10:00:00Z')

describe('batch visit preview', () => {
  it('shows exact wall times in the location, keeps duration, and vacates occupied old slots first', () => {
    const input = [proposeVisitShift(a, 60), proposeVisitShift(b, 60)]
    expect(input[0]).toMatchObject({
      oldLocal: '2026-11-27T09:00',
      newLocal: '2026-11-27T10:00',
      durationMinutes: 60,
      target: {
        start: Date.parse('2026-11-27T09:00:00Z'),
        end: Date.parse('2026-11-27T10:00:00Z'),
      },
    })
    const result = evaluateVisitBatch(input, [a, b], [], [])
    expect(result.sequence).toEqual(['B', 'A'])
    expect(result.slots[0]?.dependsOn).toEqual(['B'])
    expect(batchAgendaRange(input)).toEqual({ from: '2026-11-25', to: '2026-11-29' })
  })

  it('blocks a non-selected active visit sharing a team member and an approved absence', () => {
    const team = {
      id: 'crew',
      name: 'Equipo',
      description: '',
      archived: false,
      updatedAt: '',
      memberIds: ['member-a'],
    }
    const active = {
      ...b,
      assigned_user_id: null,
      work_team_id: 'crew',
      status: 'in_progress',
    } as const
    const result = evaluateVisitBatch(
      [proposeVisitShift(a, 60)],
      [a, active],
      [team],
      [{ userId: 'member-a', startDate: '2026-11-27', endDate: null }],
    )
    expect(result.sequence).toEqual([])
    expect(result.slots[0]?.blockers.join(' ')).toMatch(/ausencia aprobada.*Coincide con «B»/)
  })

  it('maps distinct locations to UTC and detects a collision after a DST shift', () => {
    const beforeClockChange = visit('C', '2026-10-24T08:00:00Z', '2026-10-24T09:00:00Z')
    const normalZone = visit('D', '2026-10-24T09:00:00Z', '2026-10-24T10:00:00Z', {
      timezone: 'UTC',
    })
    const preview = evaluateVisitBatch(
      [proposeVisitShift(beforeClockChange, 1_440), proposeVisitShift(normalZone, 1_440)],
      [beforeClockChange, normalZone],
      [],
      [],
    )
    expect(preview.sequence).toEqual([])
    expect(preview.slots[0]?.blockers.join(' ')).toContain('Coincide con la propuesta')
  })

  it('does not claim an ambiguous or nonexistent local hour is available', () => {
    const autumn = visit('otoño', '2026-10-24T00:30:00Z', '2026-10-24T01:30:00Z')
    const spring = visit('primavera', '2027-03-27T01:30:00Z', '2027-03-27T02:30:00Z')
    for (const original of [autumn, spring]) {
      expect(proposeVisitShift(original, 1_440)).toMatchObject({
        target: null,
        blockers: [expect.stringMatching(/Hora ambigua o inexistente/)],
      })
    }
  })

  it('uses half-open intervals and checks absence by local day for overnight work', () => {
    const overnight = visit('Noche', '2026-11-27T21:00:00Z', '2026-11-27T22:00:00Z')
    const proposal = proposeVisitShift(overnight, 60)
    const after = visit('Después', '2026-11-27T23:00:00Z', '2026-11-28T00:00:00Z')
    const preview = evaluateVisitBatch(
      [proposal],
      [overnight, after],
      [],
      [{ userId: 'member-a', startDate: '2026-11-28', endDate: '2026-11-28' }],
    )
    expect(preview.sequence).toEqual(['Noche'])
    const crossing = proposeVisitShift(overnight, 75)
    const blocked = evaluateVisitBatch(
      [crossing],
      [overnight, after],
      [],
      [{ userId: 'member-a', startDate: '2026-11-28', endDate: '2026-11-28' }],
    )
    expect(blocked.slots[0]?.blockers).toHaveLength(2)
  })

  it('blocks a stale row or an unknown resource instead of allowing a blind confirmation', () => {
    const stale = evaluateVisitBatch(
      [proposeVisitShift(a, 60)],
      [{ ...a, updated_at: 'new' }],
      [],
      [],
    )
    expect(stale.slots[0]?.blockers[0]).toContain('ha cambiado')
    const unknown = evaluateVisitBatch(
      [proposeVisitShift(a, 60)],
      [a, { ...b, work_team_id: 'unloaded-team', assigned_user_id: null }],
      [],
      [],
    )
    expect(unknown.slots[0]?.blockers[0]).toContain('No se pudo comprobar la asignación')
  })
})
