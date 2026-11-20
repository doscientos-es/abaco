import { describe, expect, it } from 'vitest'

import { projectVisitEvent } from './event'

const input = {
  tenantId: '5c000000-0000-4000-8000-000000000001',
  userId: '5c000000-0000-4000-8000-000000000002',
  visitId: '5c000000-0000-4000-8000-000000000003',
  start: new Date('2026-10-25T00:30:00Z'),
  end: new Date('2026-10-25T02:30:00Z'),
  timeZone: 'Europe/Madrid',
}

describe('local Google Calendar event projection', () => {
  it('uses a stable, scoped ID independent of scheduling and UUID letter case', () => {
    const original = projectVisitEvent(input)
    expect(original.id).toMatch(/^[0-9a-v]{5,1024}$/)
    expect(
      projectVisitEvent({
        ...input,
        tenantId: input.tenantId.toUpperCase(),
        start: new Date('2026-10-26T10:00:00Z'),
        end: new Date('2026-10-26T11:00:00Z'),
      }).id,
    ).toBe(original.id)
    for (const field of ['tenantId', 'userId', 'visitId'] as const) {
      expect(
        projectVisitEvent({ ...input, [field]: '5c000000-0000-4000-8000-000000000004' }).id,
      ).not.toBe(original.id)
    }
  })

  it('preserves instants across DST and sends only an allowlisted private projection', () => {
    const source = { ...input, notes: 'secret', title: 'client name' }
    const event = projectVisitEvent(source)
    expect(event).toEqual({
      id: event.id,
      summary: 'Visita Ábaco',
      visibility: 'private',
      start: { dateTime: '2026-10-25T00:30:00.000Z', timeZone: 'Europe/Madrid' },
      end: { dateTime: '2026-10-25T02:30:00.000Z', timeZone: 'Europe/Madrid' },
    })
    expect(JSON.stringify(event)).not.toMatch(/secret|client name/)
  })

  it('rejects invalid identities, time zones, and time ranges', () => {
    expect(() => projectVisitEvent({ ...input, userId: 'invalid' })).toThrow('identity')
    expect(() => projectVisitEvent({ ...input, timeZone: 'Europe/Invalid' })).toThrow('zone')
    expect(() => projectVisitEvent({ ...input, timeZone: '+02:00' })).toThrow('zone')
    expect(() => projectVisitEvent({ ...input, start: new Date(NaN) })).toThrow('range')
    expect(() => projectVisitEvent({ ...input, end: input.start })).toThrow('range')
    expect(() => projectVisitEvent({ ...input, start: input.end, end: input.start })).toThrow(
      'range',
    )
  })
})
