import { describe, expect, it } from 'vitest'

import { calendarChange, calendarLocalInput } from '@/shared/lib/event-calendar'

import { absenceCalendarProposal, absenceEvents } from './absence-events'
import type { VacationRequest } from './vacation-request'

const request: VacationRequest = {
  id: 'absence',
  requesterId: 'ana',
  requesterName: 'Ana',
  absenceType: 'vacation',
  startDate: '2026-11-10',
  endDate: '2026-11-12',
  comment: '',
  status: 'approved',
  submittedAt: '',
  decisionComment: '',
  decidedAt: null,
  decidedByName: '',
  informationRequestComment: '',
  requesterResponseComment: '',
  updatedAt: 'version',
}

describe('absence calendar adapter', () => {
  it('converts inclusive periods into exclusive all-day events and back without mutating the version', () => {
    const item = absenceEvents([request], '2026-11-30', true)[0]
    expect(item?.allDay).toBe(true)
    expect(item && calendarLocalInput(item.end)).toBe('2026-11-13T00:00')
    if (!item) throw new Error('Missing event')
    expect(
      absenceCalendarProposal(request, calendarChange(item, new Date(2026, 10, 20), 'move')),
    ).toEqual({ startDate: '2026-11-20', endDate: '2026-11-22' })
    expect(request.updatedAt).toBe('version')
    expect(request.startDate).toBe('2026-11-10')
  })
  it('keeps unknown ends open on move and only closes them with an explicit resize proposal', () => {
    const open = { ...request, endDate: null }
    const item = absenceEvents([open], '2026-11-30', true)[0]
    if (!item) throw new Error('Missing event')
    expect(calendarLocalInput(item.end)).toBe('2026-12-01T00:00')
    expect(
      absenceCalendarProposal(open, calendarChange(item, new Date(2026, 10, 15), 'move')).endDate,
    ).toBeNull()
    expect(
      absenceCalendarProposal(open, calendarChange(item, new Date(2026, 10, 21), 'resize')).endDate,
    ).toBe('2026-11-20')
  })
  it('does not enable gestures for denied or canceled periods or without permission', () => {
    expect(absenceEvents([request], '2026-11-30', false)[0]?.editable).toBe(false)
    expect(
      absenceEvents(
        [
          { ...request, status: 'rejected' },
          { ...request, status: 'canceled' },
        ],
        '2026-11-30',
        true,
      ).every((item) => !item.editable),
    ).toBe(true)
  })
})
